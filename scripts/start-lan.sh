#!/usr/bin/env bash
# Run the server for tablets on the same Wi-Fi. No tunnel, no cloud, no account.
#
#   ./scripts/start-lan.sh 'teacher-password' [port]
set -euo pipefail
TEACHER_KEY="${1:-}"
PORT="${2:-2567}"
[ -n "$TEACHER_KEY" ] || { echo "usage: $0 <teacher-key> [port]" >&2; exit 1; }
[ "${#TEACHER_KEY}" -ge 8 ] || { echo "teacher key must be at least 8 characters" >&2; exit 1; }
command -v node >/dev/null || { echo "Node.js not found" >&2; exit 1; }

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO/server"
[ -f node_modules/colyseus/package.json ] || { echo "==> installing server dependencies"; npm ci; }

IP="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^127\.' | head -1)"
[ -n "$IP" ] || IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
[ -n "$IP" ] || { echo "no network address found" >&2; exit 1; }

SECRET_FILE="$REPO/.tunnel-logs/report-secret.txt"
mkdir -p "$(dirname "$SECRET_FILE")"
[ -s "$SECRET_FILE" ] || head -c 24 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n' > "$SECRET_FILE"

echo
echo "======================================================="
echo "  open this on the iPads:  http://$IP:$PORT"
echo "======================================================="
echo "  the tablets must be on the same Wi-Fi as this machine"
echo "  stop: press Ctrl+C"
echo
TEACHER_KEY="$TEACHER_KEY" PORT="$PORT" NODE_ENV=development STORE_BACKEND=file \
  REPORT_SECRET="$(cat "$SECRET_FILE")" node src/index.js
