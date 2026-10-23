import { type Database, projects, type Transaction, tracks } from '@repo/db';
import {
  MAX_FILE_BYTES,
  PROJECT_LIMIT,
  STORAGE_LIMIT_BYTES,
  type UsageResponse,
} from '@repo/shared/schemas';
import { eq, sql } from 'drizzle-orm';

// Committed tracks only: a pending upload holds no quota until it completes. Storage counts
// every version in the user's own projects, whoever uploaded it.
export async function usageFor(
  db: Database | Transaction,
  userId: string,
): Promise<UsageResponse> {
  const [row] = await db
    .select({
      projectCount: sql<number>`(select count(*)::int from projects p where p.user_id = ${userId})`,
      storageUsedBytes: sql<string>`coalesce(sum(${tracks.sizeBytes}), 0)`,
    })
    .from(tracks)
    .innerJoin(projects, eq(projects.id, tracks.projectId))
    .where(eq(projects.userId, userId));
  return {
    projectCount: row?.projectCount ?? 0,
    projectLimit: PROJECT_LIMIT,
    storageUsedBytes: Number(row?.storageUsedBytes ?? 0),
    storageLimitBytes: STORAGE_LIMIT_BYTES,
    maxFileBytes: MAX_FILE_BYTES,
  };
}
