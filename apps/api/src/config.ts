import { z } from 'zod';

const baseSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  DATABASE_URL: z.url(),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),

  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  COOKIE_SECRET: z.string().min(32),

  // The one public origin: serves the SPA and, under /api, the api. In dev it's Vite's.
  // Normalized to a bare origin: callers append paths to it (`${APP_ORIGIN}/account`), so a
  // trailing slash would produce `//account`.
  APP_ORIGIN: z
    .url()
    .refine(
      (url) => !URL.canParse(url) || new URL(url).pathname === '/',
      'Must be an origin, without a path',
    )
    .transform((url) => new URL(url).origin)
    .default('http://localhost:5173'),

  // `local` keeps audio on disk and serves it from signed /api/storage/local URLs, so dev
  // and tests need no bucket. Production must use `s3` (any S3-compatible service).
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().min(1).default('.data/storage'),
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
});

const S3_REQUIRED = [
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
] as const;

export const envSchema = baseSchema.superRefine((env, ctx) => {
  // Both tokens carry `sub`, so with one shared secret a refresh token would pass as an
  // access token.
  if (env.ACCESS_TOKEN_SECRET === env.REFRESH_TOKEN_SECRET) {
    ctx.addIssue({
      code: 'custom',
      path: ['REFRESH_TOKEN_SECRET'],
      message: 'Must differ from ACCESS_TOKEN_SECRET',
    });
  }

  if (env.STORAGE_DRIVER === 's3') {
    for (const key of S3_REQUIRED) {
      if (!env[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'Required when STORAGE_DRIVER is s3',
        });
      }
    }
  }

  if (env.NODE_ENV !== 'production') return;

  if (env.STORAGE_DRIVER !== 's3') {
    ctx.addIssue({
      code: 'custom',
      path: ['STORAGE_DRIVER'],
      message: 'Must be s3 in production',
    });
  }

  if (!env.APP_ORIGIN.startsWith('https://')) {
    ctx.addIssue({
      code: 'custom',
      path: ['APP_ORIGIN'],
      message: 'Must use https in production',
    });
  }
});

export type Config = z.infer<typeof envSchema> & { isProd: boolean };

export function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error(
      'Invalid environment variables:',
      z.flattenError(result.error).fieldErrors,
    );
    process.exit(1);
  }
  return { ...result.data, isProd: result.data.NODE_ENV === 'production' };
}
