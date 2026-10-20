# syntax=docker/dockerfile:1
# One image: the Fastify api, which also serves the built SPA. Build from the repo root.

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS builder
# `pnpm fetch` reads only the lockfile, so this layer stays cached until dependencies change.
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc package.json ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile --filter=@repo/api... --filter=@repo/web...
# Node sizes its default heap from physical RAM (~256MB on a small VPS), too small for tsc + vite; swap covers the gap.
ENV NODE_OPTIONS=--max-old-space-size=1536
RUN pnpm --filter @repo/api --filter @repo/web build
RUN pnpm deploy --legacy --filter=@repo/api --prod /out

FROM node:24-alpine AS runtime
WORKDIR /app
COPY --from=builder --chown=node:node /out ./
# dist/ resolves both of these as siblings: ../migrations (migrate.js) and ../public (the SPA).
COPY --from=builder --chown=node:node /repo/packages/db/migrations ./migrations
COPY --from=builder --chown=node:node /repo/apps/web/dist ./public
USER node
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/server.js"]
