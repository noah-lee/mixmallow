import {
  type Database,
  notes,
  projects,
  type SelectNote,
  type SelectProject,
  type SelectTrack,
  type SelectTranscodeJob,
  type SelectUpload,
  type SelectUser,
  type Transaction,
  tracks,
  transcodeJobs,
  uploads,
  users,
} from '@repo/db';
import { AUDIO_FORMATS, authProviderSchema, MB } from '@repo/shared/schemas';
import { eq, sql } from 'drizzle-orm';

// One factory per table: valid defaults, unique where the schema requires it, any field
// overridable. Add new ones here as `createX(db, overrides)`.

let seq = 0;
const nextSeq = () => ++seq;

export async function createUser(
  db: Database | Transaction,
  overrides: Partial<typeof users.$inferInsert> = {},
): Promise<SelectUser> {
  const n = nextSeq();
  const [user] = await db
    .insert(users)
    .values({
      email: `user${n}@example.com`,
      authProvider: authProviderSchema.enum.google,
      authProviderId: `google-sub-${n}`,
      name: `User ${n}`,
      ...overrides,
    })
    .returning();
  if (!user) throw new Error('createUser: insert returned no row');
  return user;
}

export async function createProject(
  db: Database | Transaction,
  overrides: Pick<typeof projects.$inferInsert, 'userId'> &
    Partial<typeof projects.$inferInsert>,
): Promise<SelectProject> {
  const [project] = await db
    .insert(projects)
    .values({ name: `Project ${nextSeq()}`, ...overrides })
    .returning();
  if (!project) throw new Error('createProject: insert returned no row');
  return project;
}

// Takes the version from the project's counter, as upload completion does.
export async function createTrack(
  db: Database | Transaction,
  overrides: Pick<typeof tracks.$inferInsert, 'userId' | 'projectId'> &
    Partial<typeof tracks.$inferInsert>,
): Promise<SelectTrack> {
  const n = nextSeq();
  const [counter] = await db
    .update(projects)
    .set({ nextVersion: sql`${projects.nextVersion} + 1` })
    .where(eq(projects.id, overrides.projectId))
    .returning({ version: sql<number>`${projects.nextVersion} - 1` });
  if (!counter) throw new Error('createTrack: project not found');
  const [track] = await db
    .insert(tracks)
    .values({
      version: counter.version,
      name: `Track ${n}`,
      fileName: `track-${n}.wav`,
      format: 'wav',
      contentType: AUDIO_FORMATS.wav,
      sizeBytes: MB,
      durationMs: 252_000,
      peaks: [0, 64, 128, 255, 128, 64, 0],
      storageKey: `users/${overrides.userId}/${crypto.randomUUID()}.wav`,
      ...overrides,
    })
    .returning();
  if (!track) throw new Error('createTrack: insert returned no row');
  return track;
}

export async function createNote(
  db: Database | Transaction,
  overrides: Pick<typeof notes.$inferInsert, 'userId' | 'trackId'> &
    Partial<typeof notes.$inferInsert>,
): Promise<SelectNote> {
  const [note] = await db
    .insert(notes)
    .values({ timestampMs: 1000, text: `Note ${nextSeq()}`, ...overrides })
    .returning();
  if (!note) throw new Error('createNote: insert returned no row');
  return note;
}

export async function createUpload(
  db: Database | Transaction,
  overrides: Pick<typeof uploads.$inferInsert, 'userId'> &
    Partial<typeof uploads.$inferInsert>,
): Promise<SelectUpload> {
  const n = nextSeq();
  const [upload] = await db
    .insert(uploads)
    .values({
      fileName: `upload-${n}.wav`,
      format: 'wav',
      contentType: AUDIO_FORMATS.wav,
      sizeBytes: MB,
      storageKey: `users/${overrides.userId}/${crypto.randomUUID()}.wav`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      ...overrides,
    })
    .returning();
  if (!upload) throw new Error('createUpload: insert returned no row');
  return upload;
}

export async function createTranscodeJob(
  db: Database | Transaction,
  overrides: Pick<typeof transcodeJobs.$inferInsert, 'trackId'> &
    Partial<typeof transcodeJobs.$inferInsert>,
): Promise<SelectTranscodeJob> {
  const [job] = await db.insert(transcodeJobs).values(overrides).returning();
  if (!job) throw new Error('createTranscodeJob: insert returned no row');
  return job;
}
