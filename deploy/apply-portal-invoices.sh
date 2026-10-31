#!/usr/bin/env bash
# Activate prebuilt API + booking portal only. No build or migration on VPS.
set -Eeuo pipefail
umask 022
R="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
API=/root/artifacts/api-server/dist
PORTAL=/root/artifacts/booking-engine/dist/public
PM2=/usr/lib/node_modules/pm2/bin/pm2
[[ "$(id -u)" = 0 ]] || { echo "Ekzekutojeni si root."; exit 1; }
mkdir -p /root/releases
exec 9>/root/releases/.deploy.lock
flock -n 9 || { echo "Nje publikim tjeter eshte duke punuar."; exit 1; }
exec 8>/root/.booking-engine-ui-update.lock
flock -n 8 || { echo "Portali po perditesohet nga nje proces tjeter."; exit 1; }
test -s "$API/index.mjs"
test -s "$PORTAL/index.html"
test -f "$PM2"
cd "$R"
sha256sum --check SHA256SUMS
available=$(df -Pk "$R" | awk 'END {print $4}')
current=$(du -sk "$API" | awk '{print $1}')
payload=$(cat payload-kb.txt)
[[ "$payload" =~ ^[0-9]+$ ]] || exit 1
(( available > current + payload * 2 + 524288 )) || { echo "Hapesire e pamjaftueshme. Nuk fshiva asgje."; exit 1; }
stage="$(mktemp -d "$R/.stage.XXXXXX")"
trap 'rm -rf -- "$stage"' EXIT
mkdir "$stage/api" "$stage/portal"
tar -xzf "$R/api.tgz" -C "$stage/api"
tar -xzf "$R/portal.tgz" -C "$stage/portal"
test -s "$stage/api/index.mjs"
test -s "$stage/api/excelWorker.mjs"
test -s "$stage/portal/index.html"
grep -q '/booking-engine/assets/' "$stage/portal/index.html"
node --check "$stage/api/index.mjs"
node --check "$stage/api/excelWorker.mjs"
if [[ "${1:-}" = "--check" ]]; then
  echo "Paketa API + portal eshte gati. Nuk u aktivizua dhe nuk u rinis asgje."
  exit 0
fi
[[ $# -eq 0 ]] || exit 1
curl -fsS --max-time 10 http://127.0.0.1:3000/api/healthz >/dev/null
backup="$(mktemp -d "$R/backup.XXXXXX")"
cp -a "$API" "$backup/api"
cp -p "$PORTAL/index.html" "$backup/portal-index.html"

healthy() {
  for i in $(seq 1 30); do
    if curl -fsS --max-time 4 http://127.0.0.1:3000/api/healthz >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}
restart_api() {
  local old current
  old="$("$PM2" pid api-server | tail -1)"
  "$PM2" restart api-server --update-env
  healthy || return 1
  current="$("$PM2" pid api-server | tail -1)"
  # Stop only the known previous API PID if PM2 left it behind.
  if [[ "$old" =~ ^[1-9][0-9]*$ && "$current" =~ ^[1-9][0-9]*$ && "$old" != "$current" ]] &&
    [[ -r "/proc/$old/cmdline" ]] && tr '\0' ' ' < "/proc/$old/cmdline" | grep -q 'api-server/dist/index.mjs'; then
    kill "$old" 2>/dev/null || true
    sleep 3
    if [[ -r "/proc/$old/cmdline" ]] && tr '\0' ' ' < "/proc/$old/cmdline" | grep -q 'api-server/dist/index.mjs'; then
      kill -9 "$old" 2>/dev/null || true
    fi
  fi
  healthy
}
rollback() {
  trap - ERR INT TERM
  set +e
  echo "Aktivizimi deshtoi. Po rikthehet versioni i meparshem..."
  cp -a "$backup/api/." "$API/"
  cp -p "$backup/portal-index.html" "$PORTAL/.index-rollback.html"
  mv -f "$PORTAL/.index-rollback.html" "$PORTAL/index.html"
  restart_api
  echo "Kopja e versionit te meparshem: $backup"
  exit 1
}
trap rollback ERR INT TERM
cp -a "$stage/api/." "$API/"
restart_api
for suffix in invoices invoices/1/pdf; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:3000/api/public/my-bookings/DEPLOY-CHECK/$suffix")"
  [[ "$code" = 401 ]]
done
# Old hashes remain available to existing tabs. Publish the new index last.
cp -a "$stage/portal/assets/." "$PORTAL/assets/"
cp -p "$stage/portal/index.html" "$PORTAL/.index-invoices.html"
mv -f "$PORTAL/.index-invoices.html" "$PORTAL/index.html"
trap - ERR INT TERM
echo "U aktivizua perditesimi i faturave dhe portalit."
echo "Pa migrime databaze dhe pa ndryshime te email-eve apo panelit te brendshem."
echo "Backup: $backup"
