#!/bin/sh
set -eu

ROOT="${PLANE_APP_DIR:-/home/gunnergrant/plane-selfhost/plane-app}"
cd "$ROOT"

docker compose --env-file plane.env build og
docker build -t lgs/plane-frontend:v1.4.2-public ./public-frontend
docker compose --env-file plane.env up -d --no-deps --force-recreate og web proxy

sleep 3
curl -fsS --retry 12 --retry-all-errors --retry-delay 2 -o /dev/null http://127.0.0.1:8100/ || true
curl -fsS --retry 12 --retry-all-errors --retry-delay 2 -o /dev/null https://plane.canvassr.org/ >/dev/null
