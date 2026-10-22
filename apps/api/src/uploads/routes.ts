import { projects, type Transaction, tracks, uploads, users } from '@repo/db';
import {
  AUDIO_FORMATS,
  audioFormatSchema,
  type CompleteUploadResponse,
  type CreateUploadResponse,
  completeUploadBodySchema,
  createUploadBodySchema,
  fileExtension,
  nameFromFileName,
  PROJECT_LIMIT,
  STORAGE_LIMIT_BYTES,
  uploadIdParamsSchema,
} from '@repo/shared/schemas';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { projectRole } from '../projects/access.ts';
import { storageKey } from '../storage/driver.ts';
import { findTrackDetail } from '../tracks/queries.ts';
import { enqueueTranscode, needsPreview } from '../transcode/queue.ts';
import { usageFor } from '../usage/queries.ts';

const notFound = { error: 'not_found' } as const;

// Serialises every limit check for one user: whoever holds this row lock sees the other
// requests' committed writes.
async function lockUser(tx: Transaction, userId: string): Promise<void> {
  await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .for('update');
}

async function limitError(
  tx: Transaction,
  userId: string,
  upload: { projectId: string | null; sizeBytes: number },
): Promise<'project_limit_reached' | 'storage_limit_reached' | null> {
  const usage = await usageFor(tx, userId);
  if (upload.projectId === null && usage.projectCount >= PROJECT_LIMIT) {
    return 'project_limit_reached';
  }
  if (usage.storageUsedBytes + upload.sizeBytes > STORAGE_LIMIT_BYTES) {
    return 'storage_limit_reached';
  }
  return null;
}

export const uploadRoutes: FastifyPluginAsyncZod = async (app) => {
  const auth = { onRequest: [app.authenticate] };

  // Checks every limit and returns a signed PUT; nothing is stored yet, and a previous
  // pending upload is replaced.
  app.post(
    '/',
    { ...auth, schema: { body: createUploadBodySchema } },
    async (req, reply) => {
      const userId = req.user.sub;
      const { fileName, sizeBytes } = req.body;
      const projectId = req.body.projectId ?? null;
      const format = audioFormatSchema.parse(fileExtension(fileName));
      const contentType = AUDIO_FORMATS[format];
      const key = storageKey(userId, format);
      const presigned = await app.storage.presignPut({
        key,
        contentType,
        sizeBytes,
      });

      const result = await app.db.transaction(async (tx) => {
        await lockUser(tx, userId);
        if (projectId) {
          const role = await projectRole(tx, userId, projectId);
          if (!role) return { error: 'not_found', status: 404 } as const;
          if (role !== 'owner') {
            return { error: 'forbidden', status: 403 } as const;
          }
        }
        const limit = await limitError(tx, userId, { projectId, sizeBytes });
        if (limit) return { error: limit, status: 403 } as const;

        const replaced = await tx
          .delete(uploads)
          .where(eq(uploads.userId, userId))
          .returning({ key: uploads.storageKey });
        const [upload] = await tx
          .insert(uploads)
          .values({
            userId,
            projectId,
            fileName,
            format,
            contentType,
            sizeBytes,
            storageKey: key,
            expiresAt: presigned.expiresAt,
          })
          .returning({ id: uploads.id });
        if (!upload) throw new Error('upload insert returned no row');
        return { upload, replacedKeys: replaced.map((r) => r.key) };
      });

      if (result.error) {
        reply.code(result.status);
        return { error: result.error };
      }
      await app.storage.deleteMany(result.replacedKeys);
      reply.code(201);
      return {
        uploadId: result.upload.id,
        uploadUrl: presigned.url,
        method: 'PUT',
        headers: presigned.headers,
        expiresAt: presigned.expiresAt.toISOString(),
      } satisfies CreateUploadResponse;
    },
  );

  // Turns the stored object into a track. Nothing is created unless the object exists at
  // exactly the registered size and the limits still hold.
  app.post(
    '/:uploadId/complete',
    {
      ...auth,
      schema: { params: uploadIdParamsSchema, body: completeUploadBodySchema },
    },
    async (req, reply) => {
      const userId = req.user.sub;
      const { uploadId } = req.params;
      const [pending] = await app.db
        .select()
        .from(uploads)
        .where(and(eq(uploads.id, uploadId), eq(uploads.userId, userId)));
      if (!pending) {
        reply.code(404);
        return notFound;
      }

      // Kept for a retry: the browser may still be uploading, or will PUT again.
      const size = await app.storage.headSize(pending.storageKey);
      if (size === null) {
        reply.code(409);
        return { error: 'upload_incomplete' };
      }
      if (size !== pending.sizeBytes) {
        await app.db
          .delete(uploads)
          .where(and(eq(uploads.id, pending.id), eq(uploads.userId, userId)));
        await app.storage.deleteMany([pending.storageKey]);
        reply.code(400);
        return { error: 'upload_size_mismatch' };
      }

      const result = await app.db.transaction(async (tx) => {
        await lockUser(tx, userId);
        // Re-read under the lock: a concurrent complete, cancel or replacement wins.
        const [upload] = await tx
          .select()
          .from(uploads)
          .where(and(eq(uploads.id, uploadId), eq(uploads.userId, userId)));
        if (!upload) return { error: 'not_found', status: 404 } as const;

        const limit = await limitError(tx, userId, upload);
        if (limit) {
          await tx
            .delete(uploads)
            .where(and(eq(uploads.id, upload.id), eq(uploads.userId, userId)));
          return {
            error: limit,
            status: 403,
            orphanKey: upload.storageKey,
          } as const;
        }

        let projectId = upload.projectId;
        if (projectId === null) {
          const [created] = await tx
            .insert(projects)
            .values({ userId, name: nameFromFileName(upload.fileName) })
            .returning({ id: projects.id });
          if (!created) throw new Error('project insert returned no row');
          projectId = created.id;
        }
        // The counter only moves forward, so a deleted version's number is never reused.
        const [counter] = await tx
          .update(projects)
          .set({ nextVersion: sql`${projects.nextVersion} + 1` })
          .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
          .returning({ version: sql<number>`${projects.nextVersion} - 1` });
        if (!counter) throw new Error('upload project vanished under lock');

        const [track] = await tx
          .insert(tracks)
          .values({
            userId,
            projectId,
            version: counter.version,
            name: nameFromFileName(upload.fileName),
            fileName: upload.fileName,
            format: upload.format,
            contentType: upload.contentType,
            sizeBytes: upload.sizeBytes,
            durationMs: req.body.durationMs,
            peaks: req.body.peaks,
            storageKey: upload.storageKey,
          })
          .returning({ id: tracks.id });
        if (!track) throw new Error('track insert returned no row');
        if (needsPreview(upload.format)) {
          await enqueueTranscode(tx, track.id);
        }
        await tx
          .delete(uploads)
          .where(and(eq(uploads.id, upload.id), eq(uploads.userId, userId)));
        return { projectId, trackId: track.id };
      });

      if (result.error) {
        if (result.orphanKey) {
          await app.storage.deleteMany([result.orphanKey]);
        }
        reply.code(result.status);
        return { error: result.error };
      }
      const track = await findTrackDetail(app.db, result.trackId);
      if (!track) throw new Error('completed track not found');
      reply.code(201);
      return {
        projectId: result.projectId,
        track,
      } satisfies CompleteUploadResponse;
    },
  );

  app.delete(
    '/:uploadId',
    { ...auth, schema: { params: uploadIdParamsSchema } },
    async (req, reply) => {
      const [removed] = await app.db
        .delete(uploads)
        .where(
          and(
            eq(uploads.id, req.params.uploadId),
            eq(uploads.userId, req.user.sub),
          ),
        )
        .returning({ key: uploads.storageKey });
      if (!removed) {
        reply.code(404);
        return notFound;
      }
      await app.storage.deleteMany([removed.key]);
      return reply.code(204).send();
    },
  );
};
