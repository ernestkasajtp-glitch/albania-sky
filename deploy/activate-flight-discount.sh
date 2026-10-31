#!/usr/bin/env bash
set -Eeuo pipefail
umask 022
VERSION="${RELEASE_VERSION:-1.498}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+$ ]]
cd "$(dirname "$0")"
[[ $(id -u) = 0 ]]
PM2=/usr/lib/node_modules/pm2/bin/pm2
API=/root/artifacts/api-server/dist
FMS=/root/artifacts/flight-system/dist/public
PORTAL=/root/artifacts/booking-engine/dist/public
exec 9>/root/releases/.deploy.lock
flock -n 9 || { echo "Nje publikim tjeter po punon."; exit 1; }
exec 8>/root/.booking-engine-ui-update.lock
flock -n 8 || { echo "Portali po perditesohet."; exit 1; }
sha256sum -c SHA256SUMS
test -s "$API/index.mjs"; test -s "$FMS/index.html"; test -s "$PORTAL/index.html"
available=$(df -Pk . | awk 'END{print $4}')
needed=$(du -sk "$API" "$FMS" "$PORTAL" | awk '{s+=$1}END{print s}')
(( available > needed * 3 + 524288 )) || { echo "Hapesire e pamjaftueshme; nuk ndryshova asgje."; exit 1; }
mkdir stage
for name in api fms portal; do mkdir "stage/$name"; tar -xzf "$name.tgz" -C "stage/$name"; done
node --check stage/api/index.mjs
test -s stage/api/excelWorker.mjs
grep -q '/flight-system/assets/' stage/fms/index.html
grep -q '/booking-engine/assets/' stage/portal/index.html
node -e 'if(JSON.parse(require("fs").readFileSync("stage/fms/version.json","utf8")).version!==process.argv[1])process.exit(1)' "$VERSION"
curl -fsS --max-time 10 http://127.0.0.1:3000/api/healthz >/dev/null
mkdir backup
cp -a "$API" backup/api
cp -a "$FMS" backup/fms
cp -a "$PORTAL" backup/portal
healthy() {
  for i in $(seq 1 45); do
    if curl -fsS --max-time 4 http://127.0.0.1:3000/api/healthz >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}
restart_api() {
  local old current
  old="$("$PM2" pid api-server | tail -1)"
  "$PM2" restart api-server --update-env
  current="$("$PM2" pid api-server | tail -1)"
  if [[ "$old" =~ ^[1-9][0-9]*$ && "$current" =~ ^[1-9][0-9]*$ && "$old" != "$current" ]] &&
    [[ -r "/proc/$old/cmdline" ]] && tr '\0' ' ' < "/proc/$old/cmdline" | grep -q 'api-server/dist/index.mjs'; then
    kill "$old" 2>/dev/null || true
    sleep 3
    if [[ -r "/proc/$old/cmdline" ]] && tr '\0' ' ' < "/proc/$old/cmdline" | grep -q 'api-server/dist/index.mjs'; then
      kill -9 "$old"
    fi
  fi
  healthy
  [[ $(pgrep -fc 'api-server/dist[/]index.mjs') = 1 ]]
}
rollback() {
  trap - ERR
  set +e
  cp -a backup/api/. "$API/"
  cp -a backup/fms/. "$FMS/"
  cp -a backup/portal/. "$PORTAL/"
  restart_api
  echo "Aktivizimi deshtoi; u rikthye kopja e aplikacionit. Databaza nuk u prek."
  exit 1
}
trap rollback ERR
# Keep previous hashed assets for tabs that are already open.
cp -a stage/api/. "$API/"
restart_api
if [[ "${CHECK_PAGE_LAYOUTS:-0}" = 1 ]]; then
  curl -fsS --max-time 15 http://127.0.0.1:3000/api/page-layouts |
    node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const d=JSON.parse(s);if(!Array.isArray(d.layouts)||d.layouts.length!==Number(process.argv[1]))process.exit(1);})' "${PAGE_LAYOUT_COUNT:-10}"
fi
cp -a stage/fms/. "$FMS/"
cp -a stage/portal/. "$PORTAL/"
curl -fsS --max-time 20 "https://kingsmanagment.com/flight-system/version.json?t=$(date +%s)" |
  node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{if(JSON.parse(s).version!==process.argv[1])process.exit(1)})' "$VERSION"
"$PM2" save
trap - ERR
echo "Versioni $VERSION u aktivizua. Nuk u aplikua migrim dhe nuk u fshine te dhena."
