#!/usr/bin/env bash
# Run from Replit Shell. Builds locally; applies only the explicit additive Claims migration on VPS.
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

for cmd in pnpm sshpass ssh scp tar curl flock; do
  command -v "$cmd" >/dev/null || { echo "Mungon komanda: $cmd"; exit 1; }
done
: "${SSHPASS:?Mungon sekreti SSHPASS në Replit}"
exec 9>/tmp/kings-flight-release.lock
flock -n 9 || { echo "Një publikim tjetër është duke punuar."; exit 1; }
SERVER="root@69.57.163.245"
SSH=(sshpass -e ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)
SCP=(sshpass -e scp -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)
RELEASE="flight-alerts-$(date -u +%Y%m%d-%H%M%S)"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "Kontroll paraprak i hapësirës në VPS (pa fshirje)..."
"${SSH[@]}" "$SERVER" bash -s -- 0 0 < deploy/check-vps-capacity.sh

echo "1/5 Kontrolli i kodit..."
pnpm run typecheck
node artifacts/flight-system/scripts/priorityHistory.test.mjs
node --experimental-strip-types artifacts/api-server/scripts/stalePriceRetry.test.mjs
(
  cd artifacts/api-server
  node build-script.mjs scripts/seatCheckTransactional.test.ts node_modules/.cache/google-monitoring-seat-tests
  node node_modules/.cache/google-monitoring-seat-tests/seatCheckTransactional.test.mjs
)
pnpm --filter @workspace/api-server run test:google-price-cache
pnpm --filter @workspace/api-server run test:google-price-rules
(
  cd artifacts/api-server
  node build-script.mjs src/lib/suspectFlightRecheck.test.ts node_modules/.cache/suspect-recheck-tests
  node node_modules/.cache/suspect-recheck-tests/suspectFlightRecheck.test.mjs
)
echo "2/5 Ndërtimi lokal i API-së, Flight System dhe portalit të agjentëve..."
pnpm --filter @workspace/api-server run build
BASE_PATH=/flight-system/ pnpm --filter @workspace/flight-system run build
BASE_PATH=/booking-engine/ pnpm --filter @workspace/booking-engine run build
test -s artifacts/api-server/dist/index.mjs
test -s artifacts/api-server/dist/excelWorker.mjs
test -s artifacts/flight-system/dist/public/version.json
grep -q '/flight-system/assets/' artifacts/flight-system/dist/public/index.html
grep -q '/booking-engine/assets/' artifacts/booking-engine/dist/public/index.html
tar -czf "$WORK/api.tgz" -C artifacts/api-server/dist .
tar -czf "$WORK/web.tgz" -C artifacts/flight-system/dist/public .
tar -czf "$WORK/portal.tgz" -C artifacts/booking-engine/dist/public .
NEW_BYTES=$(du -sk artifacts/api-server/dist artifacts/flight-system/dist/public artifacts/booking-engine/dist/public | awk '{s+=$1} END {printf "%.0f",s*1024}')
ARCHIVE_BYTES=$(wc -c < "$WORK/api.tgz")
ARCHIVE_BYTES=$((ARCHIVE_BYTES + $(wc -c < "$WORK/web.tgz")))
ARCHIVE_BYTES=$((ARCHIVE_BYTES + $(wc -c < "$WORK/portal.tgz")))
NEW_FILES=$(find artifacts/api-server/dist artifacts/flight-system/dist/public artifacts/booking-engine/dist/public -print | wc -l)
NEW_FILES=$((2 * NEW_FILES))
# Extracted staging plus installed files may coexist, including old hashed assets.
REQUIRED_PAYLOAD=$((2 * NEW_BYTES + ARCHIVE_BYTES))
"${SSH[@]}" "$SERVER" bash -s -- "$REQUIRED_PAYLOAD" "$NEW_FILES" < deploy/check-vps-capacity.sh

# Exercise the real list-count predicate against mixed production settings.
# READ ONLY, before uploading or restarting anything; healthz alone is not enough.
(
  cd artifacts/api-server
  node build-script.mjs scripts/printStalePriceCheckSql.ts node_modules/.cache/stale-sql-check
  node node_modules/.cache/stale-sql-check/printStalePriceCheckSql.mjs > "$WORK/list-check.sql"
)
"${SSH[@]}" "$SERVER" 'sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d kingsdb' < "$WORK/list-check.sql"

echo "3/5 Dërgimi në server..."
"${SSH[@]}" "$SERVER" "mkdir -p /root/releases/$RELEASE"
"${SCP[@]}" "$WORK/api.tgz" "$WORK/web.tgz" "$WORK/portal.tgz" "$SERVER:/root/releases/$RELEASE/"
"${SCP[@]}" deploy/check-vps-capacity.sh "$SERVER:/root/releases/$RELEASE/check-capacity.sh"
"${SCP[@]}" deploy/migrations/20261008-claims.sql "$SERVER:/root/releases/$RELEASE/claims.sql"

echo "4/5 Backup, instalim dhe rinisje..."
"${SSH[@]}" "$SERVER" bash -s -- "$RELEASE" "$REQUIRED_PAYLOAD" "$NEW_FILES" <<'REMOTE'
set -Eeuo pipefail
R="/root/releases/$1"
API="/root/artifacts/api-server/dist"
WEB="/root/artifacts/flight-system/dist/public"
PORTAL="/root/artifacts/booking-engine/dist/public"
PM2="/usr/lib/node_modules/pm2/bin/pm2"
exec 9>/root/releases/.deploy.lock
flock -n 9 || { echo "Një publikim tjetër po punon në server."; exit 1; }
bash "$R/check-capacity.sh" "$2" "$3"
test -s "$API/index.mjs"
test -s "$WEB/index.html"
test -s "$PORTAL/index.html"
test -f "$PM2"
cp -a "$API" "$R/api-backup"
cp -a "$WEB" "$R/web-backup"
cp -a "$PORTAL" "$R/portal-backup"
mkdir "$R/api-new" "$R/web-new" "$R/portal-new"
tar -xzf "$R/api.tgz" -C "$R/api-new"
tar -xzf "$R/web.tgz" -C "$R/web-new"
tar -xzf "$R/portal.tgz" -C "$R/portal-new"
test -s "$R/api-new/index.mjs"
test -s "$R/api-new/excelWorker.mjs"
test -s "$R/web-new/index.html"
test -s "$R/portal-new/index.html"

healthy() {
  for i in $(seq 1 30); do
    if curl -fsS --max-time 4 http://127.0.0.1:3000/api/healthz >/dev/null &&
       curl -fsS --max-time 4 http://127.0.0.1:3000/api/admin/has-admin >/dev/null &&
       timeout 6 sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d kingsdb -c 'BEGIN READ ONLY; SELECT 1 FROM sessions LIMIT 1; COMMIT;' >/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}
rollback() {
  trap - ERR INT TERM
  set +e
  echo "Kalimi dështoi. Po rikthej backup-in nga $R ..."
  cp -a "$R/api-backup/." "$API/"
  cp -a "$R/web-backup/." "$WEB/"
  cp -a "$R/portal-backup/." "$PORTAL/"
  "$PM2" restart api-server --update-env
  if healthy; then
    echo "Backup-i u rikthye dhe API-ja përgjigjet."
  else
    echo "KUJDES: API-ja kërkon kontroll manual. Backup: $R"
  fi
  exit 1
}
trap rollback ERR INT TERM

# Preserve old hashed assets for already-open tabs. Publish index.html last.
# Additive schema only. An application rollback deliberately retains Claim data.
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d kingsdb < "$R/claims.sql"
cp -a "$R/api-new/." "$API/"
"$PM2" restart api-server --update-env
healthy
cp "$R/web-new/index.html" "$R/new-index.html"
rm "$R/web-new/index.html"
cp -a "$R/web-new/." "$WEB/"
cp "$R/new-index.html" "$WEB/.index-release.html"
mv "$WEB/.index-release.html" "$WEB/index.html"
cp "$R/portal-new/index.html" "$R/new-portal-index.html"
rm "$R/portal-new/index.html"
cp -a "$R/portal-new/." "$PORTAL/"
cp "$R/new-portal-index.html" "$PORTAL/.index-release.html"
mv "$PORTAL/.index-release.html" "$PORTAL/index.html"

# Verify actual public assets, not only files on disk.
curl -fsS --retry 3 --max-time 20 \
  "https://kingsmanagment.com/flight-system/index.html?release=$(basename "$R")" \
  -o "$R/public-index.html"
cmp "$R/new-index.html" "$R/public-index.html"
curl -fsS --retry 3 --max-time 20 \
  "https://kingsmanagment.com/flight-system/version.json?release=$(basename "$R")" \
  -o "$R/public-version.json"
cmp "$R/web-new/version.json" "$R/public-version.json"
curl -fsS --retry 3 --max-time 20 \
  "https://kingsmanagment.com/booking-engine/index.html?release=$(basename "$R")" \
  -o "$R/public-portal-index.html"
cmp "$R/new-portal-index.html" "$R/public-portal-index.html"
"$PM2" save
trap - ERR INT TERM
echo "Backup: $R"
REMOTE

echo "5/5 Kontrolli përfundimtar..."
curl -fsS --retry 3 --max-time 20 https://kingsmanagment.com/api/healthz
echo
echo "PËRFUNDOI. Rifresko Flight System dhe portalin e agjentëve në shfletues."
