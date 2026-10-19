import type { z } from 'zod';

export function encodeCursor(payload: object): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

// A cursor is client-supplied, so anything that isn't exactly what we encoded
// is a 400, never a 500 from a bad cast further down.
export function decodeCursor<T>(cursor: string, schema: z.ZodType<T>): T {
  try {
    const json: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );
    return schema.parse(json);
  } catch (cause) {
    throw Object.assign(new Error('invalid_cursor', { cause }), {
      statusCode: 400,
    });
  }
}
