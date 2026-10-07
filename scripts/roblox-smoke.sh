#!/usr/bin/env bash
# Roblox 連携の 3 つの口を curl で叩く（docs/ROBLOX_SYNC.md）。
#
#   USPEAK_ROBLOX_KEY=... ./scripts/roblox-smoke.sh [base-url] [username]
#
#   base-url  既定 http://127.0.0.1:2567（本番なら https://uspeak-multiplayer.fly.dev）
#   username  既定 smoke_test（Roblox のアカウント名。実在の子の名前は使わない）
#
# 鍵は引数ではなく環境変数で渡す（シェルの履歴に残さない）。何も壊さない：
# 記録は `smoke-<time>-*` の id で入り、残高は username ぶんの snapshot が書かれるだけ。
set -euo pipefail

BASE="${1:-http://127.0.0.1:2567}"
USER_NAME="${2:-smoke_test}"
KEY="${USPEAK_ROBLOX_KEY:-}"
if [ -z "$KEY" ]; then
  echo "USPEAK_ROBLOX_KEY を環境変数で渡してください（fly secrets と同じ値）" >&2
  exit 1
fi
command -v curl >/dev/null 2>&1 || { echo "curl が要ります" >&2; exit 1; }

NOW_MS=$(( $(date +%s) * 1000 ))
STAMP=$(date +%s)
H=(-sS -H "Content-Type: application/json" -H "X-USpeak-Key: ${KEY}")

echo "==> 1. 鍵なしは 401"
code=$(curl -sS -o /dev/null -w '%{http_code}' -H "Content-Type: application/json" -d '{"events":[]}' "${BASE}/api/roblox/events")
echo "    ${code}"

echo "==> 2. 学習の記録（quiz ×3・session ×1・知らない type ×1）"
curl "${H[@]}" -d @- "${BASE}/api/roblox/events" <<JSON
{
  "batchId": "smoke-${STAMP}",
  "placeId": "139338411931177",
  "world": "main",
  "events": [
    { "id": "smoke-${STAMP}-1", "ts": ${NOW_MS}, "type": "quiz", "username": "${USER_NAME}", "classCode": "6-1",
      "data": { "level": "5", "word": "apple", "correct": true, "fast": false, "retry": false, "ms": 2300 } },
    { "id": "smoke-${STAMP}-2", "ts": ${NOW_MS}, "type": "quiz", "username": "${USER_NAME}", "classCode": "6-1",
      "data": { "level": "5", "word": "river", "correct": false, "fast": true, "retry": false, "ms": 400 } },
    { "id": "smoke-${STAMP}-3", "ts": ${NOW_MS}, "type": "quiz", "username": "${USER_NAME}", "classCode": "6-1",
      "data": { "level": "5", "word": "river", "correct": true, "fast": false, "retry": true, "ms": 3100 } },
    { "id": "smoke-${STAMP}-4", "ts": ${NOW_MS}, "type": "session", "username": "${USER_NAME}", "classCode": "6-1", "world": "main",
      "data": { "seconds": 600, "coinsEarned": 12 } },
    { "id": "smoke-${STAMP}-5", "ts": ${NOW_MS}, "type": "treasure_opened", "username": "${USER_NAME}", "classCode": "6-1",
      "data": { "chest": "gold" } }
  ]
}
JSON
echo

echo "==> 3. 同じ batch をもう一度（accepted 0 / duplicates 5 になる）"
curl "${H[@]}" -d "{\"events\":[{\"id\":\"smoke-${STAMP}-1\",\"ts\":${NOW_MS},\"type\":\"quiz\",\"username\":\"${USER_NAME}\",\"data\":{}},{\"id\":\"smoke-${STAMP}-2\",\"ts\":${NOW_MS},\"type\":\"quiz\",\"username\":\"${USER_NAME}\",\"data\":{}},{\"id\":\"smoke-${STAMP}-3\",\"ts\":${NOW_MS},\"type\":\"quiz\",\"username\":\"${USER_NAME}\",\"data\":{}},{\"id\":\"smoke-${STAMP}-4\",\"ts\":${NOW_MS},\"type\":\"session\",\"username\":\"${USER_NAME}\",\"data\":{}},{\"id\":\"smoke-${STAMP}-5\",\"ts\":${NOW_MS},\"type\":\"treasure_opened\",\"username\":\"${USER_NAME}\",\"data\":{}}]}" "${BASE}/api/roblox/events"
echo

echo "==> 4. 残高 100 を預けて、未配達の Web の増減を受け取る"
PENDING=$(curl "${H[@]}" -d "{\"users\":[{\"username\":\"${USER_NAME}\",\"userId\":\"0\",\"balance\":100}]}" "${BASE}/api/roblox/wallet/pending")
echo "    ${PENDING}"

echo "==> 5. 受け取った行に印を付ける（適用後の残高と一緒に）"
# jq があれば id を拾う。無ければ空の ack（残高だけ更新）。
if command -v jq >/dev/null 2>&1; then
  IDS=$(printf '%s' "$PENDING" | jq -c '.users[0].entries | map(.id)')
  TOTAL=$(printf '%s' "$PENDING" | jq -r '.users[0].total')
else
  IDS='[]'; TOTAL=0
fi
curl "${H[@]}" -d "{\"acks\":[{\"username\":\"${USER_NAME}\",\"ids\":${IDS},\"balance\":$((100 + TOTAL))}]}" "${BASE}/api/roblox/wallet/ack"
echo

echo "==> 6. 負の残高は 400"
code=$(curl -sS -o /dev/null -w '%{http_code}' "${H[@]}" -d "{\"users\":[{\"username\":\"${USER_NAME}\",\"balance\":-1}]}" "${BASE}/api/roblox/wallet/pending")
echo "    ${code}"

echo
echo "保護者ページ: ${BASE}/report/${USER_NAME}?t=<署名>（署名は /admin の「Roblox 連携」か 先生コンソールの 🎮 から）"
echo "先生ページ:   ${BASE}/class/6-1?t=<署名>（先生コンソールの「教室のようす」）"
