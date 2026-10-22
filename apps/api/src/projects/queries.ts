import {
  type Database,
  projectMembers,
  projects,
  type Transaction,
  tracks,
  uploads,
  users,
} from '@repo/db';
import type { Project } from '@repo/shared/schemas';
import { and, desc, eq, isNotNull, or, type SQL, sql } from 'drizzle-orm';

// Plain SQL with an explicit outer reference: inside a subquery Drizzle renders columns
// unqualified, so `${projects.id}` would bind to the inner table.
const projectFields = {
  id: projects.id,
  name: projects.name,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
  trackCount: sql<number>`(select count(*)::int from tracks t where t.project_id = "projects"."id")`,
  latestTrack: sql<{
    id: string;
    version: number;
  } | null>`(select json_build_object('id', t.id, 'version', t.version) from tracks t where t.project_id = "projects"."id" order by t.version desc limit 1)`,
  collaboratorCount: sql<number>`(select count(*)::int from project_members m where m.project_id = "projects"."id")`,
  ownerId: users.id,
  ownerName: users.name,
  ownerPicture: users.picture,
  joinedAt: projectMembers.createdAt,
};

// The caller's membership row is joined in, so it is null for the owner and for outsiders.
async function selectProjects(
  db: Database | Transaction,
  userId: string,
  where: SQL | undefined,
  order: SQL[],
): Promise<Project[]> {
  const rows = await db
    .select(projectFields)
    .from(projects)
    .innerJoin(users, eq(users.id, projects.userId))
    .leftJoin(
      projectMembers,
      and(
        eq(projectMembers.projectId, projects.id),
        eq(projectMembers.userId, userId),
      ),
    )
    .where(where)
    .orderBy(...order);
  return rows.map(({ ownerId, ownerName, ownerPicture, joinedAt, ...row }) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    role: ownerId === userId ? 'owner' : 'collaborator',
    owner: { id: ownerId, name: ownerName, picture: ownerPicture },
    joinedAt: joinedAt?.toISOString() ?? null,
  }));
}

export async function listProjects(
  db: Database | Transaction,
  userId: string,
): Promise<{ items: Project[]; shared: Project[] }> {
  const items = await selectProjects(db, userId, eq(projects.userId, userId), [
    desc(projects.createdAt),
    desc(projects.id),
  ]);
  const shared = await selectProjects(
    db,
    userId,
    isNotNull(projectMembers.userId),
    [desc(projectMembers.createdAt), desc(projects.id)],
  );
  return { items, shared };
}

// The project as the owner or a collaborator sees it; null for anyone else.
export async function findProject(
  db: Database | Transaction,
  userId: string,
  projectId: string,
): Promise<Project | null> {
  const [project] = await selectProjects(
    db,
    userId,
    and(
      eq(projects.id, projectId),
      or(eq(projects.userId, userId), isNotNull(projectMembers.userId)),
    ),
    [],
  );
  return project ?? null;
}

// Deletes the project (tracks, notes, transcode jobs and its pending upload cascade) and
// returns the storage keys it held, originals and previews, for the caller to delete after
// commit. null when not found.
export async function deleteProject(
  db: Database,
  userId: string,
  projectId: string,
): Promise<string[] | null> {
  return db.transaction(async (tx) => {
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .for('update');
    if (!project) return null;
    // Locked so a preview the worker is committing either lands before this read or finds
    // its track gone (and discards the object) instead of being orphaned by the cascade.
    const trackKeys = await tx
      .select({ key: tracks.storageKey, previewKey: tracks.previewKey })
      .from(tracks)
      .where(eq(tracks.projectId, projectId))
      .for('update');
    const uploadKeys = await tx
      .select({ key: uploads.storageKey })
      .from(uploads)
      .where(eq(uploads.projectId, projectId));
    await tx.delete(projects).where(eq(projects.id, projectId));
    return [
      ...trackKeys.flatMap((row) =>
        row.previewKey ? [row.key, row.previewKey] : [row.key],
      ),
      ...uploadKeys.map((row) => row.key),
    ];
  });
}
