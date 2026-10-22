import {
  type Database,
  projects,
  type Transaction,
  tracks,
  uploads,
} from '@repo/db';
import type { Project } from '@repo/shared/schemas';
import { and, desc, eq, type SQL, sql } from 'drizzle-orm';

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
};

async function selectProjects(
  db: Database | Transaction,
  where: SQL | undefined,
): Promise<Project[]> {
  const rows = await db
    .select(projectFields)
    .from(projects)
    .where(where)
    .orderBy(desc(projects.createdAt), desc(projects.id));
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export function listProjects(db: Database | Transaction, userId: string) {
  return selectProjects(db, eq(projects.userId, userId));
}

export async function findProject(
  db: Database | Transaction,
  userId: string,
  projectId: string,
): Promise<Project | null> {
  const [project] = await selectProjects(
    db,
    and(eq(projects.id, projectId), eq(projects.userId, userId)),
  );
  return project ?? null;
}

export async function ownsProject(
  db: Database | Transaction,
  userId: string,
  projectId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  return row !== undefined;
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
    const trackKeys = await tx
      .select({ key: tracks.storageKey, previewKey: tracks.previewKey })
      .from(tracks)
      .where(eq(tracks.projectId, projectId));
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
