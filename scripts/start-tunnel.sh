#!/usr/bin/env bash
# Run the multiplayer server on this machine and expose it through a free Cloudflare
# quick tunnel. No cloud account and no credit card needed.
#
#   ./scripts/start-tunnel.sh 'teacher-password'
#
# Prints an https URL that iPads can open from anywhere. Ctrl+C stops both.
# For testing only; deploy with scripts/deploy-fly.sh for classroom use.
set -euo pipefail

TEACHER_KEY="${1:-}"
PORT="${2:-2567}"
[ -n "$TEACHER_KEY" ] || { echo "usage: $0 <teacher-key> [port]" >&2; exit 1; }
[ "${#TEACHER_KEY}" -ge 8 ] || { echo "teacher key must be at least 8 characters" >&2; exit 1; }
command -v node >/dev/null || { echo "Node.js not found" >&2; exit 1; }
command -v cloudflared >/dev/null || { echo "cloudflared not found: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2; exit 1; }

# An earlier run still listening would otherwise fail with a raw EADDRINUSE trace.
if (command -v lsof >/dev/null && lsof -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1) \
  || (command -v ss >/dev/null && ss -ltn "sport = :$PORT" 2>/dev/null | grep -q LISTEN); then
  echo "port $PORT is already in use, most likely an earlier run of this script." >&2
  echo "stop it, or start this one on another port:  $0 <teacher-key> $((PORT + 1))" >&2
  exit 1
fi

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO/server"
# A partial node_modules (interrupted install) must not be mistaken for a finished one.
[ -f node_modules/colyseus/package.json ] || { echo "==> installing server dependencies (a few minutes on the first run)"; npm ci; }
[ -f node_modules/colyseus/package.json ] || { echo "dependencies are still incomplete after npm ci" >&2; exit 1; }

echo "==> starting server on port $PORT"
TEACHER_KEY="$TEACHER_KEY" PORT="$PORT" NODE_ENV=development STORE_BACKEND=file node src/index.js &
SERVER_PID=$!
cleanup() { echo; echo "==> stopping the server"; kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

for _ in $(seq 30); do
  sleep 0.7
  curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1 && break
done
curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null || { echo "the server did not become healthy" >&2; exit 1; }
echo "==> server is healthy"

echo "==> opening the Cloudflare tunnel (this can take a few seconds)"
# PROTOCOL=http2 falls back to TCP when the network blocks QUIC on UDP 7844.
CF_ARGS=(tunnel --url "http://localhost:${PORT}")
[ -n "${PROTOCOL:-}" ] && CF_ARGS+=(--protocol "$PROTOCOL")
# EDGE_IP_VERSION=4 forces IPv4 when the network has no working IPv6 route.
[ -n "${EDGE_IP_VERSION:-}" ] && CF_ARGS+=(--edge-ip-version "$EDGE_IP_VERSION")
cloudflared "${CF_ARGS[@]}" 2>&1 | while IFS= read -r line; do
  if [[ "$line" =~ (https://[a-z0-9-]+\.trycloudflare\.com) ]]; then
    echo
    echo "======================================================="
    echo "  open this on the iPads:  ${BASH_REMATCH[1]}"
    echo "======================================================="
    echo
  fi
  echo "$line"
done
