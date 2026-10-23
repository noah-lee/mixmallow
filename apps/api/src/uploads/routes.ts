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
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { lockMembership, projectRole } from '../projects/access.ts';
import { storageKey } from '../storage/driver.ts';
import { findTrackDetail } from '../tracks/queries.ts';
import { enqueueTranscode, needsPreview } from '../transcode/queue.ts';
import { usageFor } from '../usage/queries.ts';

const notFound = { error: 'not_found' } as const;

// Locks the uploader (one pending upload each) and the project owner (whose storage the
// version counts against), so whoever holds them sees the other requests' committed writes.
// One query in id order: Maya uploading to Sam's project while Sam uploads to hers can't
// deadlock.
async function lockUsers(tx: Transaction, userIds: string[]): Promise<void> {
  await tx
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.id, [...new Set(userIds)]))
    .orderBy(asc(users.id))
    // Not `update`: that would also block the key-share locks note and member inserts take.
    .for('no key update');
}

async function projectOwner(
  tx: Transaction,
  projectId: string,
): Promise<string | null> {
  const [project] = await tx
    .select({ ownerId: projects.userId })
    .from(projects)
    .where(eq(projects.id, projectId));
  return project?.ownerId ?? null;
}

// `ownerId` owns the target project; for a first upload, the uploader.
async function limitError(
  tx: Transaction,
  ownerId: string,
  upload: { projectId: string | null; sizeBytes: number },
): Promise<'project_limit_reached' | 'storage_limit_reached' | null> {
  const usage = await usageFor(tx, ownerId);
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
        let ownerId = userId;
        if (projectId) {
          const owner = (await projectRole(tx, userId, projectId))
            ? await projectOwner(tx, projectId)
            : null;
          if (!owner) return { error: 'not_found', status: 404 } as const;
          ownerId = owner;
        }
        await lockUsers(tx, [userId, ownerId]);
        // Re-resolved under the lock: a removal or deletion meanwhile wins. The key-share
        // lock keeps the project from being deleted before the upload row references it.
        if (projectId) {
          const [project] = await tx
            .select({ id: projects.id })
            .from(projects)
            .where(eq(projects.id, projectId))
            .for('key share');
          if (!project || !(await projectRole(tx, userId, projectId))) {
            return { error: 'not_found', status: 404 } as const;
          }
        }
        const limit = await limitError(tx, ownerId, { projectId, sizeBytes });
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
        // A deleted project took the upload with it (cascade), so the re-read below 404s.
        const ownerId = pending.projectId
          ? ((await projectOwner(tx, pending.projectId)) ?? userId)
          : userId;
        await lockUsers(tx, [userId, ownerId]);
        // Re-read under the lock: a concurrent complete, cancel or replacement wins.
        const [upload] = await tx
          .select()
          .from(uploads)
          .where(and(eq(uploads.id, uploadId), eq(uploads.userId, userId)));
        if (!upload) {
          return { error: 'not_found', status: 404, orphanKey: null } as const;
        }
        const discard = async <E extends string, S extends number>(
          error: E,
          status: S,
        ) => {
          await tx
            .delete(uploads)
            .where(and(eq(uploads.id, upload.id), eq(uploads.userId, userId)));
          return { error, status, orphanKey: upload.storageKey } as const;
        };

        if (upload.projectId) {
          // Project row before membership, the order project deletion locks them in; the
          // version counter below updates this row anyway.
          await tx
            .select({ id: projects.id })
            .from(projects)
            .where(eq(projects.id, upload.projectId))
            .for('no key update');
          const role = await projectRole(tx, userId, upload.projectId);
          if (
            !role ||
            (role === 'collaborator' &&
              !(await lockMembership(tx, upload.projectId, userId)))
          ) {
            return discard('not_found', 404);
          }
        }

        const limit = await limitError(tx, ownerId, upload);
        if (limit) return discard(limit, 403);

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
          .where(eq(projects.id, projectId))
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
