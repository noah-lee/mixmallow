#!/usr/bin/env bash
# Deploy on the VPS from the repo root, after pulling: `bash deploy.sh`
set -euo pipefail

docker compose build
# Validate the env and migrate with the new image while the old container keeps serving.
docker compose run --rm app node dist/migrate.js
# Queues previews for lossless tracks that have none; a no-op once every track has a job.
docker compose run --rm app node dist/backfill-previews.js
docker compose up -d --remove-orphans
# Dangling images only: old builds of this app. Never touches running containers or other apps' images.
docker image prune -f
docker compose ps
