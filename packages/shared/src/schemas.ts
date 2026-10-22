import { z } from 'zod';

// Each value is an api route segment (`/api/auth/<provider>/start`) and the value of
// `users.auth_provider`.
export const authProviderSchema = z.enum(['google']);

export type AuthProvider = z.infer<typeof authProviderSchema>;

export const meResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string().nullable(),
  picture: z.url().nullable(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;

export const RETURN_PATH_MAX = 2048;

const hasControlChar = (value: string) =>
  [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });

// Where to land after sign-in. Browsers treat `//host` and `/\host` as other origins, and
// every `/api` prefix (even `/apiary`) is refused so a return path can never hit the api.
export const returnPathSchema = z
  .string()
  .max(RETURN_PATH_MAX)
  .refine(
    (path) =>
      path.startsWith('/') &&
      path[1] !== '/' &&
      path[1] !== '\\' &&
      !path.startsWith('/api') &&
      !hasControlChar(path),
  );

export type ReturnPath = z.infer<typeof returnPathSchema>;

export const MB = 1_048_576;
export const MAX_FILE_BYTES = 100 * MB;
export const STORAGE_LIMIT_BYTES = 100 * MB;
export const PROJECT_LIMIT = 1;
export const NOTE_LIMIT_PER_TRACK = 500;
export const NAME_MAX = 100;
export const NOTE_TEXT_MAX = 2000;
export const MAX_DURATION_MS = 6 * 3600 * 1000;
export const PEAKS_MAX = 10_000;

// Keyed by file extension. The server derives the stored content type from the
// extension; the browser's MIME guess is never trusted.
export const AUDIO_FORMATS = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
} as const;

export type AudioFormat = keyof typeof AUDIO_FORMATS;

export const audioFormatSchema = z.enum(
  Object.keys(AUDIO_FORMATS) as [AudioFormat, ...AudioFormat[]],
);

export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

export function isAudioFileName(fileName: string): boolean {
  return audioFormatSchema.safeParse(fileExtension(fileName)).success;
}

export function nameFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const base = (dot === -1 ? fileName : fileName.slice(0, dot)).trim();
  return base.slice(0, NAME_MAX).trim() || 'Untitled';
}

export const nameSchema = z.string().trim().min(1).max(NAME_MAX);

export const renameBodySchema = z.object({ name: nameSchema });

export type RenameBody = z.infer<typeof renameBodySchema>;

export const projectIdParamsSchema = z.object({ projectId: z.uuid() });
export const trackIdParamsSchema = z.object({ trackId: z.uuid() });
export const noteIdParamsSchema = z.object({ noteId: z.uuid() });
export const uploadIdParamsSchema = z.object({ uploadId: z.uuid() });

const count = z.number().int().nonnegative();

export const usageResponseSchema = z.object({
  projectCount: count,
  projectLimit: count,
  storageUsedBytes: count,
  storageLimitBytes: count,
  maxFileBytes: count,
});

export type UsageResponse = z.infer<typeof usageResponseSchema>;

// Collaborators per project; the owner is not counted.
export const COLLABORATOR_LIMIT = 10;

export const projectRoleSchema = z.enum(['owner', 'collaborator']);

export type ProjectRole = z.infer<typeof projectRoleSchema>;

// What other users may see of someone. Never carries an email.
export const personSchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  picture: z.url().nullable(),
});

export type Person = z.infer<typeof personSchema>;

export const projectSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  trackCount: count,
  latestTrack: z
    .object({ id: z.uuid(), version: z.number().int().positive() })
    .nullable(),
  role: projectRoleSchema,
  owner: personSchema,
  collaboratorCount: count,
  // When the caller joined; null for the owner.
  joinedAt: z.iso.datetime().nullable(),
});

export type Project = z.infer<typeof projectSchema>;

// `items` are the caller's own projects; `shared` the ones they joined, newest joined first.
export const projectListResponseSchema = z.object({
  items: z.array(projectSchema),
  shared: z.array(projectSchema),
});

export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;

export const trackSummarySchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  version: z.number().int().positive(),
  name: z.string(),
  format: audioFormatSchema,
  sizeBytes: count,
  durationMs: count,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  noteCount: count,
  doneNoteCount: count,
});

export type TrackSummary = z.infer<typeof trackSummarySchema>;

export const trackDetailSchema = trackSummarySchema.extend({
  peaks: z.array(z.number().int()),
});

export type TrackDetail = z.infer<typeof trackDetailSchema>;

export const trackListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const trackListResponseSchema = z.object({
  items: z.array(trackSummarySchema),
  nextCursor: z.string().nullable(),
});

export type TrackListResponse = z.infer<typeof trackListResponseSchema>;

export const createUploadBodySchema = z.object({
  projectId: z.uuid().optional(),
  fileName: z
    .string()
    .min(1)
    .max(255)
    .refine(isAudioFileName, 'Use a WAV, MP3, FLAC or AAC file'),
  sizeBytes: z.number().int().min(1).max(MAX_FILE_BYTES),
});

export type CreateUploadBody = z.infer<typeof createUploadBodySchema>;

export const createUploadResponseSchema = z.object({
  uploadId: z.uuid(),
  // A presigned object-storage URL.
  uploadUrl: z.string(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.iso.datetime(),
});

export type CreateUploadResponse = z.infer<typeof createUploadResponseSchema>;

export const completeUploadBodySchema = z.object({
  durationMs: z.number().int().min(1).max(MAX_DURATION_MS),
  peaks: z.array(z.number().int().min(0).max(255)).min(1).max(PEAKS_MAX),
});

export type CompleteUploadBody = z.infer<typeof completeUploadBodySchema>;

export const completeUploadResponseSchema = z.object({
  projectId: z.uuid(),
  track: trackDetailSchema,
});

export type CompleteUploadResponse = z.infer<
  typeof completeUploadResponseSchema
>;

export const audioUrlResponseSchema = z.object({
  url: z.string(),
  expiresAt: z.iso.datetime(),
});

export type AudioUrlResponse = z.infer<typeof audioUrlResponseSchema>;

export const noteSchema = z.object({
  id: z.uuid(),
  trackId: z.uuid(),
  timestampMs: count,
  text: z.string(),
  done: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Note = z.infer<typeof noteSchema>;

export const noteListResponseSchema = z.object({
  items: z.array(noteSchema),
});

export type NoteListResponse = z.infer<typeof noteListResponseSchema>;

export const noteTextSchema = z.string().trim().min(1).max(NOTE_TEXT_MAX);

const timestampMsSchema = z.number().int().min(0);

// `done` lets Undo restore a deleted note as it was.
export const createNoteBodySchema = z.object({
  timestampMs: timestampMsSchema,
  text: noteTextSchema,
  done: z.boolean().optional(),
});

export type CreateNoteBody = z.infer<typeof createNoteBodySchema>;

export const updateNoteBodySchema = z
  .object({
    timestampMs: timestampMsSchema.optional(),
    text: noteTextSchema.optional(),
    done: z.boolean().optional(),
  })
  .refine(
    (body) => Object.values(body).some((v) => v !== undefined),
    'Change at least one field',
  );

export type UpdateNoteBody = z.infer<typeof updateNoteBodySchema>;
