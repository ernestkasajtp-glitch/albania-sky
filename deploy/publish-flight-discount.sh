#!/usr/bin/env bash
# Run manually from Replit Shell. Builds locally; never builds/migrates on VPS.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
host="${VPS_HOST:-root@69.57.163.245}"
remote="/root/releases/flight-discount-1.498-$(date +%Y%m%d-%H%M%S)"
stage="$(mktemp -d /tmp/flight-discount-release.XXXXXX)"
trap 'rm -rf -- "$stage"' EXIT
pnpm run typecheck
pnpm --filter @workspace/api-server run test:flight-visibility
pnpm --filter @workspace/flight-system run test:flight-discount
node --experimental-strip-types artifacts/flight-system/scripts/flightDiscountApi.test.ts
pnpm --filter @workspace/api-server run build
BASE_PATH=/flight-system/ pnpm --filter @workspace/flight-system run build
BASE_PATH=/booking-engine/ pnpm --filter @workspace/booking-engine run build
grep -q '/flight-system/assets/' artifacts/flight-system/dist/public/index.html
grep -q '/booking-engine/assets/' artifacts/booking-engine/dist/public/index.html
test -s artifacts/api-server/dist/excelWorker.mjs
tar -czf "$stage/api.tgz" -C artifacts/api-server/dist .
tar -czf "$stage/fms.tgz" -C artifacts/flight-system/dist/public .
tar -czf "$stage/portal.tgz" -C artifacts/booking-engine/dist/public .
cp deploy/activate-flight-discount.sh "$stage/activate.sh"
(cd "$stage"; sha256sum api.tgz fms.tgz portal.tgz activate.sh > SHA256SUMS)
ssh_cmd=(ssh); scp_cmd=(scp)
if [[ -n "${SSHPASS:-}" ]]; then
  ssh_cmd=(sshpass -e ssh); scp_cmd=(sshpass -e scp)
fi
"${ssh_cmd[@]}" "$host" "mkdir -p '$remote'"
"${scp_cmd[@]}" "$stage/"* "$host:$remote/"
"${ssh_cmd[@]}" "$host" "bash '$remote/activate.sh'"
echo "Kontrollo versionin 1.498 te FMS; kopja e meparshme: $remote/backup"
