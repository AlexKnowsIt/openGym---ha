#!/bin/sh
# Runs the add-on image the way Home Assistant does and tests it from the outside.
#
#   opengym/test/smoke.sh <image>          container checks (smoke.mjs)
#   E2E=1 opengym/test/smoke.sh <image>    plus the browser test (ingress-e2e.mjs, needs Playwright)
#
# Network 172.30.32.0/23 like the Supervisor's: the add-on at 172.30.33.5, the "Supervisor" at
# 172.30.32.2. The client containers reuse the image under test (it has node), so nothing else is
# pulled, except nginx:alpine as the ingress proxy for the browser test.
set -eu
IMAGE=${1:?usage: smoke.sh <image>}
HERE=$(cd "$(dirname "$0")" && pwd)
NET=opengym-smoke
ADDON=$NET-addon
PROXY=$NET-ingress
DATA=$(mktemp -d)

cleanup() {
  [ "${failed:-}" ] && docker logs "$ADDON" 2>&1 | tail -40
  docker rm -f "$ADDON" "$PROXY" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  docker run --rm -v "$DATA:/data" --entrypoint rm "$IMAGE" -rf /data/opengym >/dev/null 2>&1 || true
  rm -rf "$DATA"
}
trap 'failed=1; cleanup' INT TERM
trap '[ $? -ne 0 ] && failed=1; cleanup' EXIT

echo '{"allow_guest":false,"default_lang":"de"}' > "$DATA/options.json"
docker network create --subnet 172.30.32.0/23 "$NET" >/dev/null
start() { docker run -d --name "$ADDON" --network "$NET" --ip 172.30.33.5 -v "$DATA:/data" "$IMAGE" >/dev/null; }
client() { ip=$1; shift; docker run --rm --network "$NET" --ip "$ip" -v "$HERE:/t:ro" --entrypoint node "$IMAGE" /t/smoke.mjs "$@"; }

labels=$(docker inspect -f '{{index .Config.Labels "io.hass.type"}}' "$IMAGE")
[ "$labels" = addon ] || { echo "✗ image label io.hass.type is '$labels', want 'addon'"; exit 1; }

start
client 172.30.32.2 supervisor
client 172.30.33.9 outsider

# An update replaces the container and keeps /data.
docker rm -f "$ADDON" >/dev/null
start
client 172.30.32.2 restarted

if [ "${E2E:-}" = 1 ]; then
  cat > "$DATA/ingress.conf" <<'EOF'
server {
  listen 80;
  location = / {
    default_type text/html;
    return 200 '<!doctype html><body style="margin:0"><iframe src="/api/hassio_ingress/TOKEN123/" style="width:100vw;height:100vh;border:0"></iframe>';
  }
  location /api/hassio_ingress/TOKEN123/ {
    proxy_pass http://172.30.33.5:8099/;
    proxy_set_header X-Remote-User-Id 00000000000000000000000000e2e000;
    proxy_set_header X-Remote-User-Name e2e;
    proxy_set_header X-Remote-User-Display-Name "E2E Tester";
  }
}
EOF
  docker run -d --name "$PROXY" --network "$NET" --ip 172.30.32.2 -p 127.0.0.1:18123:80 \
    -v "$DATA/ingress.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine >/dev/null
  sleep 1
  node "$HERE/ingress-e2e.mjs" http://127.0.0.1:18123/
fi
echo "✓ add-on smoke test passed"
