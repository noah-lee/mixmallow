import {
  type Database,
  notes,
  projectMembers,
  projects,
  type Transaction,
  tracks,
} from '@repo/db';
import type { ProjectRole } from '@repo/shared/schemas';
import { and, eq } from 'drizzle-orm';

// Every project, track and note route resolves the caller's role here. null means not a
// member (or no such row), which every route answers with 404, exactly like a missing id.

type RoleRow = { ownerId: string; memberId: string | null };

const roleFields = {
  ownerId: projects.userId,
  memberId: projectMembers.userId,
};

const membership = (userId: string) =>
  and(
    eq(projectMembers.projectId, projects.id),
    eq(projectMembers.userId, userId),
  );

function roleOf(row: RoleRow, userId: string): ProjectRole | null {
  if (row.ownerId === userId) return 'owner';
  return row.memberId === null ? null : 'collaborator';
}

export async function projectRole(
  db: Database | Transaction,
  userId: string,
  projectId: string,
): Promise<ProjectRole | null> {
  const [row] = await db
    .select(roleFields)
    .from(projects)
    .leftJoin(projectMembers, membership(userId))
    .where(eq(projects.id, projectId));
  return row ? roleOf(row, userId) : null;
}

export type TrackAccess = {
  role: ProjectRole;
  projectId: string;
  durationMs: number;
};

// `lock` takes the track row lock, so concurrent note creates count each other's notes.
export async function trackAccess(
  db: Database | Transaction,
  userId: string,
  trackId: string,
  options: { lock?: boolean } = {},
): Promise<TrackAccess | null> {
  const query = db
    .select({
      ...roleFields,
      projectId: tracks.projectId,
      durationMs: tracks.durationMs,
    })
    .from(tracks)
    .innerJoin(projects, eq(projects.id, tracks.projectId))
    .leftJoin(projectMembers, membership(userId))
    .where(eq(tracks.id, trackId));
  const [row] = options.lock
    ? await query.for('update', { of: tracks })
    : await query;
  const role = row ? roleOf(row, userId) : null;
  if (!row || !role) return null;
  return { role, projectId: row.projectId, durationMs: row.durationMs };
}

export type NoteAccess = {
  role: ProjectRole;
  authorId: string;
  durationMs: number;
};

// `lock` takes the note row lock and, for a collaborator, a share lock on their membership,
// so a removal waits for the write or the write sees the removal (Postgres can't lock the
// nullable side of the outer join, hence the second query).
export async function noteAccess(
  db: Database | Transaction,
  userId: string,
  noteId: string,
  options: { lock?: boolean } = {},
): Promise<NoteAccess | null> {
  const query = db
    .select({
      ...roleFields,
      projectId: projects.id,
      authorId: notes.userId,
      durationMs: tracks.durationMs,
    })
    .from(notes)
    .innerJoin(tracks, eq(tracks.id, notes.trackId))
    .innerJoin(projects, eq(projects.id, tracks.projectId))
    .leftJoin(projectMembers, membership(userId))
    .where(eq(notes.id, noteId));
  const [row] = options.lock
    ? await query.for('update', { of: notes })
    : await query;
  const role = row ? roleOf(row, userId) : null;
  if (!row || !role) return null;
  if (options.lock && role === 'collaborator') {
    const [member] = await db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, row.projectId),
          eq(projectMembers.userId, userId),
        ),
      )
      .for('share');
    if (!member) return null;
  }
  return { role, authorId: row.authorId, durationMs: row.durationMs };
}
