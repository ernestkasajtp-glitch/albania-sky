#!/usr/bin/env bash
# Coordinated API + FMS editor + public booking-engine release. No DB migration.
set -Eeuo pipefail
umask 022
cd "$(dirname "$0")"
PM2=/usr/lib/node_modules/pm2/bin/pm2
API=/root/artifacts/api-server/dist
FMS=/root/artifacts/flight-system/dist/public
BE=/root/artifacts/booking-engine/dist/public
exec 9>/root/releases/.deploy.lock
flock -n 9 || { echo "Another release is running"; exit 1; }
sha256sum -c SHA256SUMS
available=$(df -Pk . | awk 'END{print $4}')
needed=$(du -sk "$API" "$FMS" "$BE" | awk '{s+=$1}END{print s}')
(( available > needed * 3 + 524288 ))
mkdir -p stage/api stage/fms stage/be backup
tar -xzf api.tgz -C stage/api
tar -xzf fms.tgz -C stage/fms
tar -xzf be.tgz -C stage/be
node --check stage/api/index.mjs
test -s stage/api/excelWorker.mjs
grep -q '/flight-system/assets/' stage/fms/index.html
grep -q '/booking-engine/assets/' stage/be/index.html
node -e 'if(JSON.parse(require("fs").readFileSync("stage/fms/version.json")).version!=="1.527")process.exit(1)'
curl -fsS --max-time 10 http://127.0.0.1:3000/api/healthz >/dev/null
cp -a "$API" backup/api
cp -a "$FMS" backup/fms
cp -a "$BE" backup/be
restart_api() {
  local old current
  old="$("$PM2" pid api-server | tail -1)"
  "$PM2" restart api-server --update-env
  current="$("$PM2" pid api-server | tail -1)"
  if [[ "$old" =~ ^[1-9][0-9]*$ && "$current" =~ ^[1-9][0-9]*$ && "$old" != "$current" ]] &&
    [[ -r "/proc/$old/cmdline" ]] && tr '\0' ' ' < "/proc/$old/cmdline" | grep -q 'api-server/dist/index.mjs'; then
    kill "$old" 2>/dev/null || true
    sleep 3
    if [[ -r "/proc/$old/cmdline" ]] && tr '\0' ' ' < "/proc/$old/cmdline" | grep -q 'api-server/dist/index.mjs'; then kill -9 "$old"; fi
  fi
  for i in $(seq 1 45); do
    if curl -fsS --max-time 4 http://127.0.0.1:3000/api/healthz >/dev/null 2>&1; then
      [[ $(pgrep -fc 'api-server/dist[/]index.mjs') = 1 ]]
      return
    fi
    sleep 2
  done
  return 1
}
rollback() {
  trap - ERR
  cp -a backup/api/. "$API/"
  cp -a backup/fms/. "$FMS/"
  cp -a backup/be/. "$BE/"
  restart_api
  echo "Restored previous application bundles."
  exit 1
}
trap rollback ERR
cp -a stage/api/. "$API/"
restart_api
# Preserve old hashed assets for existing browser tabs.
cp -a stage/fms/. "$FMS/"
cp -a stage/be/. "$BE/"
curl -fsS --max-time 20 "https://kingsmanagment.com/flight-system/version.json?t=$(date +%s)" |
  node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{if(JSON.parse(s).version!=="1.527")process.exit(1)})'
curl -fsS --max-time 20 "https://kingsmanagment.com/api/public/offer-banners" |
  node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const r=JSON.parse(s);if(!Number.isFinite(r.serverNow)||!Array.isArray(r.banners))process.exit(1)})'
"$PM2" save
trap - ERR
echo "Release 1.527 activated."
