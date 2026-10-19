# turborepo

Turborepo + pnpm + TypeScript boilerplate. Vite React SPA, Fastify API, PostgreSQL.

## Requirements

- Node 24 LTS (`.nvmrc` provided — `nvm use` / `fnm use` / etc.)
- pnpm 10+ (managed via corepack — run `corepack enable` once, then `pnpm install` activates the version pinned in `package.json`)
- A PostgreSQL connection string (`DATABASE_URL`) — Postgres is external to this repo. The companion [postgres](../postgres) repo provides a ready-made local + VPS setup with per-app database provisioning.

## Quickstart

Provision a database via the postgres companion repo:

```bash
cd ../postgres
cp .env.example .env       # set POSTGRES_PASSWORD
docker compose up -d
bash ./scripts/add-app.sh turborepo
```

Copy the printed `DATABASE_URL` into this repo's `.env`:

```bash
cd ../turborepo
cp .env.example .env       # paste DATABASE_URL
pnpm install
pnpm db:migrate
pnpm dev
```

Web runs at http://localhost:5173, API at http://localhost:3000. Vite proxies `/api/*` to the API in dev, unchanged: the API's routes live under `/api` in every environment. Set `PORT` in `.env` to move the API; the proxy follows it.

### Required to boot

The API validates its env at startup and exits if anything is missing. A fresh clone needs, at minimum:

- `DATABASE_URL`
- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Token/cookie secrets: `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `COOKIE_SECRET` (generate with `openssl rand -base64 48`)
- Stripe billing: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PREMIUM_PRICE_ID` — `.env.example` documents how to obtain each, including running `stripe listen` to forward webhooks in local dev.
- Production only: `APP_ORIGIN=https://your.domain` (defaults to `http://localhost:5173` in dev)

The Google redirect URI is derived as `<APP_ORIGIN>/api/auth/google/callback`; register that exact URL (for both dev and production) on the OAuth client. Optional: `PORT` (3000), `LOG_LEVEL` (info).

Billing is included by default. A project that doesn't need it can delete `apps/api/src/billing` (and the `billingPlugin`/`billingRoutes` registrations in `app.ts`), the billing UI in `apps/web` (`src/features/billing`, `BillingSection` in `routes/_app/account.tsx`, `useCheckoutToast` in `routes/__root.tsx`), the `stripe_*` tables in `packages/db/src/schema.ts` (then `pnpm db:generate`), the billing schemas in `packages/shared/src/schemas.ts`, the `STRIPE_*` env in `config.ts` and `.env.example`, and `stripe` from `apps/api/package.json`. `isPremium` crosses into auth too: drop the `stripe_subscriptions` join from `GET /auth/me` in `apps/api/src/auth/routes.ts`, the field from `meResponseSchema`, and the Premium badge in `account.tsx`.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Run all apps in watch mode (Vite + `node --watch`) |
| `pnpm build` | Build every app for production |
| `pnpm typecheck` | Project-wide TypeScript check |
| `pnpm lint` | Biome check across the repo |
| `pnpm format` | Biome write-formatting |
| `pnpm db:generate` | Generate a new SQL migration from `packages/db/src/schema.ts` |
| `pnpm db:migrate` | Apply pending migrations to `DATABASE_URL` |
| `pnpm db:studio` | Open Drizzle Studio (DB browser) |
| `pnpm db:check` | Fail if `schema.ts` has changes no committed migration covers |
| `pnpm verify` | Lint, migration check, typecheck, unit + integration tests, build (stops at the first failure) |
| `pnpm verify:full` | `verify`, then the e2e suite |
| `pnpm test` | Vitest in every package |
| `pnpm test:e2e` | Playwright (mobile + desktop Chromium) |
| `pnpm e2e:shots <route>` | Screenshot routes into `e2e/screenshots/` |

## Testing

Tests run against a real Postgres database whose name must end in `_test` (they drop and truncate everything in it). With the postgres companion repo:

```bash
docker exec -i postgres psql -U postgres -c "CREATE DATABASE turborepo_test OWNER turborepo;"
# then in .env: TEST_DATABASE_URL = your DATABASE_URL with the database name turborepo_test
```

`pnpm verify` is the "is this repo healthy?" check; `pnpm verify:full` adds the browser tests (the first run downloads Chromium). Every test run rebuilds the test database from the committed migrations. Playwright starts its own api (port 3100) and web preview (port 5174), so it can run beside `pnpm dev`.

- **Where tests live:** `<package>/test/*.test.ts` (Vitest) for `packages/shared` (schema units), `packages/db` (migrations) and `apps/api` (integration tests through `app.inject()`, against the real app and database), and `e2e/tests/` (Playwright). Test files share one database, so they run one at a time; don't run Vitest and Playwright at the same time.
- **API helpers** (`apps/api/test/helpers/`): `createTestApp()` builds the real app with dummy config, `createTestSession(app)` inserts a user and returns real auth cookies to pass to `inject`, and `factories.ts` holds a `createX(db, overrides)` per table (add one per new table).
- **OAuth** is tested offline: `stubGoogleTokenEndpoint()` replaces the `fetch` call to Google's token endpoint with an unsigned id_token, and `startSignIn(app)` gives the state and cookies for `/callback`. Stripe webhooks are signed locally; checkout, portal and sync call Stripe's API and aren't tested.
- **New endpoints** should come with integration tests for: no session (401), invalid input (400), the happy path, and, for anything a user owns, that another user can't read or change it (see `GET /billing/subscription` in `apps/api/test/billing.test.ts`).
- **E2E:** import `test`/`expect` from `e2e/support/fixtures.ts`, so a test fails on any page or console error. The suite is signed in through `createTestSession`, not Google. To look at a page, `pnpm e2e:shots <route>` (or `captureScreenshot(page, name)` in a test) saves a screenshot to `e2e/screenshots/`.

## Adding a database migration

1. Edit `packages/db/src/schema.ts`
2. `pnpm db:generate` — drizzle-kit writes a new SQL file under `packages/db/migrations/`
3. Review the SQL, commit it (`pnpm db:check`, part of `pnpm verify`, fails until a migration covers the schema)
4. `pnpm db:migrate` — applies pending migrations to `DATABASE_URL`

In production, run migrations as a one-shot job before rolling out a new api image (see VPS deployment below).

## Adding a shadcn/ui component

```bash
pnpm --filter @repo/web exec shadcn add <component>
```

## Adding a page

Routing is file-based ([TanStack Router](https://tanstack.com/router)). Drop a file under `apps/web/src/routes` and the route tree (`routeTree.gen.ts`, committed) regenerates on the next `pnpm dev`/`build`:

- `routes/about.tsx` → `/about` — public
- `routes/_app/settings.tsx` → `/settings` — behind the auth guard in `routes/_app.tsx`

Each file exports a `Route` via `createFileRoute`. Public pages sit at the top level; anything requiring a signed-in user goes under `_app/`. Wrap a page in `PageLayout` (header + footer) unless it's under `_app/`, which already does. Out of the box: `/` (landing), `/privacy`, `/terms` (public) and `/account` (signed in). Rename the product in `src/lib/site.ts` and the `<title>` in `index.html`.

## VPS deployment

The repo's `Dockerfile` builds one image: the Fastify api, which also serves the built SPA (everything outside `/api`, with a fallback to `index.html` for client-side routes). `docker-compose.yml` runs it as the single `app` service, on the external `shared-pg` network (created by the [postgres](../postgres) companion repo) so it reaches `postgres:5432`.

```
Internet :443 → host nginx (TLS) → 127.0.0.1:$PORT → app container (/api/* + SPA) → postgres:5432
```

```bash
# 1. Bring up Postgres on the VPS (if not already running)
cd postgres
cp .env.example .env       # set POSTGRES_PASSWORD
docker compose up -d
bash ./scripts/add-app.sh turborepo
# Note the printed DATABASE_URL_INTERNAL — it uses `postgres:5432` Docker DNS

# 2. Deploy
cd ../turborepo
cp .env.example .env       # paste DATABASE_URL_INTERNAL as DATABASE_URL, set
                           # APP_ORIGIN to your https domain, the Google OAuth client,
                           # token secrets and STRIPE_* vars (all required to boot).
bash deploy.sh             # build, validate env + migrate, start, prune old images
```

`deploy.sh` is also the redeploy command: pull, then run it again. Its migrate step validates the whole env, then migrates with the new image while the old container keeps serving, so a bad `.env` or a failed migration stops the deploy before anything is swapped.

The container is published on `127.0.0.1:$PORT` (default 3000), reachable only from the VPS itself (Docker-published ports bypass UFW, so binding all interfaces would expose plain http). `PORT` is the one port setting: the api listens on it, compose publishes it, and the healthcheck probes it. Put a TLS-terminating proxy on the host in front of it and send **every** request there, `/api/` included. For a host nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;   # no trailing slash: pass the path through unchanged
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;   # the api rate-limits per client from this
}
```

Register the Stripe webhook endpoint as `https://your.domain/api/billing/webhook`.

**Multiple apps on the same VPS:** give each its own `PORT` in its `.env`. They all share the `shared-pg` network, and each app reaches only its own database.

## Building the Docker image standalone

For one-off builds (e.g. registry push), without compose: `docker build -t turborepo .` from the repo root.

## Architecture

- `apps/api` — Fastify API (Node 24, native TS via type-stripping in dev, tsdown bundle for prod); in production it also serves the built SPA
- `apps/web` — Vite + React + Tailwind v4 + shadcn/ui + TanStack Router (file-based) + TanStack Query
- `packages/db` — Drizzle schema + client factory + migration runner
- `packages/shared` — Zod schemas shared between web and api
- `packages/tsconfig` — shared TypeScript presets (`base`, `react`)
- `e2e` — Playwright browser tests (dev only; never installed in the Docker image)

## What's included

- **Auth** — Google OIDC + PKCE; access/refresh JWTs in HttpOnly cookies (`__Host-`/`__Secure-` prefixed in prod); global sign-out via a rotating `session_id`.
- **Billing** — Stripe subscriptions: checkout, customer portal, and webhook sync with atomic idempotency. Single premium tier out of the box.
- **Security** — `@fastify/helmet` (CSP and other security headers on every response, the SPA included) + a coarse per-IP `@fastify/rate-limit` on `/api` (the Stripe webhook is exempt).

### Extending

- Add a route: create a plugin under `apps/api/src`, register it inside the `/api` scope in `app.ts`. Put Zod schemas in the route options (`fastify-type-provider-zod`) and guard with `{ onRequest: [app.authenticate] }`.
- Add a shared type/contract: add a Zod schema in `packages/shared/src/schemas.ts` and consume it on both sides.
- Add email or file uploads: there's no seam for these yet — decorate a provider onto the app the way `billing/plugin.ts` decorates `stripe` (e.g. `app.decorate('email', ...)`), and wire in an SDK (Resend/Postmark/SES, or S3/R2) when you actually need one.

## Node 24 native TypeScript

The api runs `.ts` files directly via Node's type-stripping. This means avoiding TS features that can't be erased: enums, `namespace` blocks, parameter properties, legacy decorators. `erasableSyntaxOnly: true` is on in the shared `tsconfig` to catch any slip-ups.
