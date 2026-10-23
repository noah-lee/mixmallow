import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Config } from '../config.ts';
import {
  AUDIO_URL_TTL_MS,
  type StorageDriver,
  UPLOAD_URL_TTL_MS,
} from './driver.ts';

// Virtual-hosted style: the browser PUTs to and plays from https://<bucket>.<endpoint host>,
// which the CSP in app.ts must allow.
export function s3BucketOrigin(config: Config): string {
  return `https://${config.S3_BUCKET}.${new URL(config.S3_ENDPOINT).host}`;
}

const seconds = (ms: number) => Math.floor(ms / 1000);

export function createS3Driver(config: Config): StorageDriver {
  const client = new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    forcePathStyle: false,
    // By default the SDK presigns a checksum of the (empty) body it was given, which the
    // browser's real file then fails. The signed content-length already pins the size.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
  });
  const Bucket = config.S3_BUCKET;

  return {
    async presignPut({ key, contentType, sizeBytes }) {
      const expiresAt = new Date(Date.now() + UPLOAD_URL_TTL_MS);
      const url = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket,
          Key: key,
          ContentType: contentType,
          ContentLength: sizeBytes,
        }),
        {
          expiresIn: seconds(UPLOAD_URL_TTL_MS),
          signableHeaders: new Set(['content-type', 'content-length']),
        },
      );
      // The browser sets Content-Length itself; it can't be sent as a header from script.
      return { url, headers: { 'Content-Type': contentType }, expiresAt };
    },

    async presignGet(key) {
      const expiresAt = new Date(Date.now() + AUDIO_URL_TTL_MS);
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket, Key: key }),
        { expiresIn: seconds(AUDIO_URL_TTL_MS) },
      );
      return { url, expiresAt };
    },

    async headSize(key) {
      try {
        const res = await client.send(
          new HeadObjectCommand({ Bucket, Key: key }),
        );
        return res.ContentLength ?? null;
      } catch (err) {
        if (
          err instanceof S3ServiceException &&
          err.$metadata.httpStatusCode === 404
        ) {
          return null;
        }
        throw err;
      }
    },

    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },

    async download(key, filePath, signal) {
      const res = await client.send(
        new GetObjectCommand({ Bucket, Key: key }),
        {
          abortSignal: signal,
        },
      );
      if (!res.Body) throw new Error(`object ${key} has no body`);
      await pipeline(res.Body as Readable, createWriteStream(filePath), {
        signal,
      });
    },

    async upload({ key, filePath, contentType, signal }) {
      // A stream body needs an explicit length, or the SDK can't sign the PUT.
      const { size } = await stat(filePath);
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body: createReadStream(filePath),
          ContentType: contentType,
          ContentLength: size,
        }),
        { abortSignal: signal },
      );
    },
  };
}
