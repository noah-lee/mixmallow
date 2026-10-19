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

  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PREMIUM_PRICE_ID: z.string().startsWith('price_'),
});

const envSchema = baseSchema.superRefine((env, ctx) => {
  // Both tokens carry `sub`, so with one shared secret a refresh token would pass as an
  // access token.
  if (env.ACCESS_TOKEN_SECRET === env.REFRESH_TOKEN_SECRET) {
    ctx.addIssue({
      code: 'custom',
      path: ['REFRESH_TOKEN_SECRET'],
      message: 'Must differ from ACCESS_TOKEN_SECRET',
    });
  }

  if (env.NODE_ENV !== 'production') return;

  if (!env.APP_ORIGIN.startsWith('https://')) {
    ctx.addIssue({
      code: 'custom',
      path: ['APP_ORIGIN'],
      message: 'Must use https in production',
    });
  }
  if (!env.STRIPE_SECRET_KEY.startsWith('sk_live_')) {
    ctx.addIssue({
      code: 'custom',
      path: ['STRIPE_SECRET_KEY'],
      message: 'Must be a live key (sk_live_) in production',
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
