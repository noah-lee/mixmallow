import { type Database, projects, type Transaction, tracks } from '@repo/db';
import type { UsageResponse } from '@repo/shared/schemas';
import { eq, sql } from 'drizzle-orm';
import { planFor } from './plan.ts';

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
  const plan = planFor(userId);
  return {
    projectCount: row?.projectCount ?? 0,
    projectLimit: plan.projectLimit,
    storageUsedBytes: Number(row?.storageUsedBytes ?? 0),
    storageLimitBytes: plan.storageLimitBytes,
    maxFileBytes: plan.maxFileBytes,
    acceptedFormats: plan.acceptedFormats,
    collaboratorLimit: plan.collaboratorLimit,
  };
}
