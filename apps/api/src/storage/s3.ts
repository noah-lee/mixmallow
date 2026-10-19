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

function s3Config(config: Config) {
  const {
    S3_ENDPOINT,
    S3_REGION,
    S3_BUCKET,
    S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY,
  } = config;
  // config.ts already requires these for the s3 driver.
  if (
    !S3_ENDPOINT ||
    !S3_BUCKET ||
    !S3_ACCESS_KEY_ID ||
    !S3_SECRET_ACCESS_KEY
  ) {
    throw new Error('S3 storage is not configured');
  }
  return {
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    bucket: S3_BUCKET,
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  };
}

// Virtual-hosted style: the browser PUTs to and plays from https://<bucket>.<endpoint host>,
// which the CSP in app.ts must allow.
export function s3BucketOrigin(config: Config): string {
  const { endpoint, bucket } = s3Config(config);
  return `https://${bucket}.${new URL(endpoint).host}`;
}

const seconds = (ms: number) => Math.floor(ms / 1000);

export function createS3Driver(config: Config): StorageDriver {
  const s3 = s3Config(config);
  const client = new S3Client({
    endpoint: s3.endpoint,
    region: s3.region,
    forcePathStyle: false,
    credentials: {
      accessKeyId: s3.accessKeyId,
      secretAccessKey: s3.secretAccessKey,
    },
  });
  const Bucket = s3.bucket;

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
  };
}
