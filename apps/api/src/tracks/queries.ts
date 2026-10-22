import { type Database, type Transaction, tracks } from '@repo/db';
import {
  audioFormatSchema,
  type TrackDetail,
  type TrackSummary,
} from '@repo/shared/schemas';
import { eq, sql } from 'drizzle-orm';

// Plain SQL with an explicit outer reference: inside a subquery Drizzle renders columns
// unqualified, so `${tracks.id}` would bind to notes.id.
const noteCount = (done?: boolean) =>
  sql<number>`(select count(*)::int from notes n where n.track_id = "tracks"."id"${
    done ? sql` and n.done` : sql``
  })`;

export const trackSummaryFields = {
  id: tracks.id,
  projectId: tracks.projectId,
  version: tracks.version,
  name: tracks.name,
  format: tracks.format,
  sizeBytes: tracks.sizeBytes,
  durationMs: tracks.durationMs,
  createdAt: tracks.createdAt,
  updatedAt: tracks.updatedAt,
  noteCount: noteCount(),
  doneNoteCount: noteCount(true),
};

type TrackSummaryRow = Omit<
  TrackSummary,
  'format' | 'createdAt' | 'updatedAt'
> & { format: string; createdAt: Date; updatedAt: Date };

export function toTrackSummary(row: TrackSummaryRow): TrackSummary {
  return {
    ...row,
    format: audioFormatSchema.parse(row.format),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// No access check: callers resolve the caller's role first.
export async function findTrackDetail(
  db: Database | Transaction,
  trackId: string,
): Promise<TrackDetail | null> {
  const [row] = await db
    .select({ ...trackSummaryFields, peaks: tracks.peaks })
    .from(tracks)
    .where(eq(tracks.id, trackId));
  if (!row) return null;
  const { peaks, ...summary } = row;
  return { ...toTrackSummary(summary), peaks };
}
