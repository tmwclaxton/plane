#!/bin/sh
set -eu

ROOT="${PLANE_APP_DIR:-/home/gunnergrant/plane-selfhost/plane-app}"
cd "$ROOT"

# Cloudflare 1010 blocks the OG container from the public LGS host.
python3 - <<'PY'
from pathlib import Path
path = Path("docker-compose.yaml")
text = path.read_text()
text = text.replace(
    "LGS_API_URL: https://www.letsgosocial.co.uk",
    "LGS_API_URL: http://172.17.0.1:8099",
)
text = text.replace(
    "LGS_API_URL: https://letsgosocial.co.uk",
    "LGS_API_URL: http://172.17.0.1:8099",
)
if "host.docker.internal:host-gateway" not in text and "  og:" in text:
    text = text.replace(
        "      LGS_PLANE_WORKSPACE: lgs\n    deploy:\n",
        "      LGS_PLANE_WORKSPACE: lgs\n    extra_hosts:\n      - \"host.docker.internal:host-gateway\"\n    deploy:\n",
    )
path.write_text(text)
print("lgs_api_url_ok")
PY

SRC="${PLANE_SRC_DIR:-/home/gunnergrant/plane-selfhost/plane-src}"
if [ ! -f "$SRC/apps/web/Dockerfile.web" ]; then
  echo "missing Plane web Dockerfile at $SRC/apps/web/Dockerfile.web" >&2
  exit 1
fi

# Always compile apps/web from source. Do not ship the stock
# makeplane frontend or a JS-hotpatched copy of it.
DOCKER_BUILDKIT=1 docker build \
  -f "$SRC/apps/web/Dockerfile.web" \
  -t lgs/plane-frontend:v1.4.2-built \
  "$SRC"

if ! docker run --rm --entrypoint grep lgs/plane-frontend:v1.4.2-built -R -l 'key:`crm`' /usr/share/nginx/html/assets >/dev/null; then
  echo "built frontend is missing compiled CRM nav" >&2
  exit 1
fi

docker compose --env-file plane.env build og
docker build -t lgs/plane-frontend:v1.4.2-public ./public-frontend
docker compose --env-file plane.env up -d --no-deps --force-recreate og web proxy

sleep 3
curl -fsS --retry 12 --retry-all-errors --retry-delay 2 -o /dev/null http://127.0.0.1:8100/ || true
curl -fsS --retry 12 --retry-all-errors --retry-delay 2 -o /dev/null https://plane.canvassr.org/ >/dev/null
