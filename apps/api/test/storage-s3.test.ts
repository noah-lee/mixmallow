import { describe, expect, it } from 'vitest';
import { createS3Driver, s3BucketOrigin } from '../src/storage/s3.ts';
import { createTestConfig } from './helpers/config.ts';

// Presigning is local signing, so this runs offline with dummy credentials.
const config = createTestConfig({
  S3_ENDPOINT: 'https://ams3.digitaloceanspaces.com',
  S3_BUCKET: 'bucket',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
});

describe('s3 driver', () => {
  it('signs content type and length into a PUT without a body checksum', async () => {
    const { url, headers } = await createS3Driver(config).presignPut({
      key: `users/${crypto.randomUUID()}/${crypto.randomUUID()}.wav`,
      contentType: 'audio/wav',
      sizeBytes: 1234,
    });
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://bucket.ams3.digitaloceanspaces.com');
    expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toBe(
      'content-length;content-type;host',
    );
    expect(url).not.toMatch(/x-amz-checksum|x-amz-sdk-checksum/i);
    expect(headers).toEqual({ 'Content-Type': 'audio/wav' });
  });

  it('derives the bucket origin for the CSP', () => {
    expect(s3BucketOrigin(config)).toBe(
      'https://bucket.ams3.digitaloceanspaces.com',
    );
  });
});
