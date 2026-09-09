#!/usr/bin/env bash
# One-shot Fly.io deploy for the U-Speak multiplayer server.
#
#   ./scripts/deploy-fly.sh <app-name> <teacher-key>
#
# Creates the app on first run, keeps CORS_ORIGINS in sync with the app name,
# and deploys. Safe to re-run: later runs just redeploy.
set -euo pipefail

APP="${1:-}"
TEACHER_KEY="${2:-}"
REGION="${FLY_REGION:-nrt}"

if [ -z "$APP" ] || [ -z "$TEACHER_KEY" ]; then
  echo "usage: $0 <app-name> <teacher-key>" >&2
  echo "  app-name    : globally unique, lowercase letters/digits/dashes (e.g. uspeak-multiplayer)" >&2
  echo "  teacher-key : 8+ characters, given to teachers only" >&2
  exit 1
fi
if [ "${#TEACHER_KEY}" -lt 8 ]; then
  echo "teacher key must be at least 8 characters" >&2
  exit 1
fi
command -v fly >/dev/null 2>&1 || { echo "flyctl not found. Install it: https://fly.io/docs/flyctl/install/" >&2; exit 1; }

URL="https://${APP}.fly.dev"
echo "==> app=${APP} region=${REGION} url=${URL}"

# 1. Create the app if it does not exist yet, and point fly.toml at it.
if ! fly status --app "$APP" >/dev/null 2>&1; then
  echo "==> creating app"
  fly apps create "$APP" --org personal
fi
# Keep fly.toml's app name and CORS origin consistent with the chosen name.
python3 - "$APP" "$URL" <<'PY'
import re, sys
app, url = sys.argv[1], sys.argv[2]
p = 'fly.toml'
s = open(p, encoding='utf-8').read()
s = re.sub(r'^app = ".*"$', f'app = "{app}"', s, count=1, flags=re.M)
s = re.sub(r'^  CORS_ORIGINS = ".*"$', f'  CORS_ORIGINS = "{url}"', s, count=1, flags=re.M)
open(p, 'w', encoding='utf-8').write(s)
print(f'fly.toml: app={app} CORS_ORIGINS={url}')
PY

# 2. Secrets. Google Sheets values are optional; set them here if present in the environment.
echo "==> setting secrets"
SECRETS=("TEACHER_KEY=${TEACHER_KEY}")
[ -n "${GOOGLE_SHEET_ID:-}" ] && SECRETS+=("GOOGLE_SHEET_ID=${GOOGLE_SHEET_ID}")
[ -n "${GOOGLE_SERVICE_ACCOUNT_JSON:-}" ] && SECRETS+=("GOOGLE_SERVICE_ACCOUNT_JSON=${GOOGLE_SERVICE_ACCOUNT_JSON}")
fly secrets set --app "$APP" --stage "${SECRETS[@]}"

# 3. Deploy. --remote-only builds on Fly's builders, so no local Docker is needed.
echo "==> deploying"
fly deploy --app "$APP" --remote-only

echo
echo "==> health check"
sleep 5
curl -fsS "${URL}/healthz" && echo
echo
echo "done. open ${URL} on the classroom iPads."
echo "teachers enter the key under the lobby's 先生用 section."
