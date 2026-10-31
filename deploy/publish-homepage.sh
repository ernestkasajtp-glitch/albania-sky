#!/usr/bin/env bash
# Run in Replit Shell. --check verifies/builds without changing VPS.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
host="${VPS_HOST:-root@69.57.163.245}"
ssh_cmd=(ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
scp_cmd=(scp -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
if [[ -n "${SSHPASS:-}" ]]; then
  ssh_cmd=(sshpass -e "${ssh_cmd[@]}")
  scp_cmd=(sshpass -e "${scp_cmd[@]}")
fi
if [[ "${1:-}" != "--check" ]]; then
  "${ssh_cmd[@]}" "$host" 'echo "Lidhja me VPS OK"; node -e '\''const v=JSON.parse(require("fs").readFileSync("/root/artifacts/flight-system/dist/public/version.json")).version;if(!["1.499","1.500","1.501","1.502","1.503","1.504","1.505","1.506","1.507","1.508","1.509","1.510","1.511","1.512","1.513","1.514","1.515"].includes(v))throw Error("Version i papritur: "+v)'\'''
fi
pnpm --filter @workspace/booking-engine run typecheck
node --experimental-strip-types artifacts/flight-system/scripts/google-rule-selection.test.ts
node --experimental-strip-types --test artifacts/booking-engine/scripts/unpaid-filter.test.mjs
(cd artifacts/api-server && node build-script.mjs scripts/priorityBookingLinks.test.ts /tmp/priority-booking-links-test && node /tmp/priority-booking-links-test/priorityBookingLinks.test.mjs)
pnpm --filter @workspace/api-server run test:page-layouts
pnpm --filter @workspace/flight-system run test:page-layouts
pnpm --filter @workspace/api-server run build
BASE_PATH=/flight-system/ pnpm --filter @workspace/flight-system run build
BASE_PATH=/booking-engine/ pnpm --filter @workspace/booking-engine run build
grep -q '/flight-system/assets/' artifacts/flight-system/dist/public/index.html
grep -q '/booking-engine/assets/' artifacts/booking-engine/dist/public/index.html
test -s artifacts/api-server/dist/excelWorker.mjs
node -e 'if(JSON.parse(require("fs").readFileSync("artifacts/flight-system/dist/public/version.json")).version!=="1.515")process.exit(1)'
bash -n deploy/apply-static-assets-cache.sh
if [[ "${1:-}" = "--check" ]]; then
  echo "Kontrollet 1.515 perfunduan. VPS nuk u prek."
  exit 0
fi
stage="$(mktemp -d /tmp/airline-pages.XXXXXX)"
trap 'rm -rf -- "$stage"' EXIT
tar -czf "$stage/api.tgz" -C artifacts/api-server/dist .
tar -czf "$stage/fms.tgz" -C artifacts/flight-system/dist/public .
tar -czf "$stage/portal.tgz" -C artifacts/booking-engine/dist/public .
cp deploy/activate-flight-discount.sh "$stage/activate.sh"
cp deploy/apply-static-assets-cache.sh deploy/static-assets-cache.conf "$stage/"
(cd "$stage"; sha256sum api.tgz fms.tgz portal.tgz activate.sh apply-static-assets-cache.sh static-assets-cache.conf > SHA256SUMS)
remote="/root/releases/homepage-1.515-$(date +%Y%m%d-%H%M%S)"
"${ssh_cmd[@]}" "$host" "mkdir -p '$remote'"
"${scp_cmd[@]}" "$stage/"* "$host:$remote/"
"${ssh_cmd[@]}" "$host" "RELEASE_VERSION=1.515 CHECK_PAGE_LAYOUTS=1 PAGE_LAYOUT_COUNT=11 bash '$remote/activate.sh'"
"${ssh_cmd[@]}" "$host" "bash '$remote/apply-static-assets-cache.sh'"
echo "Kopja e meparshme: $remote/backup"
curl -fsS --max-time 20 https://albaniasky.com/api/page-layouts | node -e '
let s=""; process.stdin.on("data",c=>s+=c); process.stdin.on("end",()=>{
 const d=JSON.parse(s);
 for(const p of ["home","flights","book_flight"]) {
   const row=d.layouts.find(x=>x.scope==="external"&&x.page===p);
   console.log(p+": "+row?.variant);
   if(row?.variant!=="canvas") console.log("Zgjedhja e ruajtur u ruajt. Aktivizo Dizajni i ri (Canvas) te Cilesimet > Faqet per "+p+".");
 }
});'
echo "Versioni 1.515 u ngarkua. Nuk u aplikuan migrime."
