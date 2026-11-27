#!/usr/bin/env bash
# One-shot Fly.io deploy for the U-Speak multiplayer server.
#
#   ./scripts/deploy-fly.sh <app-name>
#
# The teacher key is read from $TEACHER_KEY or asked for without echo (a key given as the
# second argument still works but stays in the shell history). Secrets reach flyctl on
# stdin (`fly secrets import`), never on its command line.
#
# Creates the app on first run, keeps CORS_ORIGINS in sync with the app name,
# and deploys. Safe to re-run: later runs just redeploy.
set -euo pipefail

APP="${1:-}"
TEACHER_KEY="${2:-${TEACHER_KEY:-}}"
REGION="${FLY_REGION:-nrt}"

if [ -n "$APP" ] && [ -z "$TEACHER_KEY" ] && [ -t 0 ]; then
  read -rsp "teacher key (8+ characters, not shown): " TEACHER_KEY; echo >&2
fi
if [ -z "$APP" ] || [ -z "$TEACHER_KEY" ]; then
  echo "usage: [TEACHER_KEY=...] $0 <app-name>" >&2
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
# One NAME=VALUE per line on stdin; a multi-line value goes in triple quotes.
secret_line() {
  case "$2" in
    *$'\n'*) printf '%s="""\n%s\n"""\n' "$1" "$2" ;;
    *) printf '%s=%s\n' "$1" "$2" ;;
  esac
}
{
  secret_line TEACHER_KEY "$TEACHER_KEY"
  [ -n "${GOOGLE_SHEET_ID:-}" ] && secret_line GOOGLE_SHEET_ID "$GOOGLE_SHEET_ID"
  [ -n "${GOOGLE_SERVICE_ACCOUNT_JSON:-}" ] && secret_line GOOGLE_SERVICE_ACCOUNT_JSON "$GOOGLE_SERVICE_ACCOUNT_JSON"
  true
} | fly secrets import --app "$APP" --stage

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
