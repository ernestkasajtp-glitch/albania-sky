#!/usr/bin/env bash
# Frontend only: no API restart, database changes or pricing modifications.
set -Eeuo pipefail
umask 022
cd "$(dirname "$0")"
target=/root/artifacts/flight-system/dist/public
exec 9>/root/releases/.deploy.lock
flock -n 9 || { echo "Another release is running"; exit 1; }
sha256sum -c SHA256SUMS
node -e 'const v=JSON.parse(require("fs").readFileSync(process.argv[1])).version;if(v!=="1.525")throw Error("Unexpected version: "+v)' "$target/version.json"
available=$(df -Pk . | awk 'END{print $4}')
needed=$(du -sk "$target" | awk '{print $1}')
(( available > needed * 3 + 102400 ))
mkdir stage
tar -xzf fms.tgz -C stage
grep -q '/flight-system/assets/' stage/index.html
node -e 'if(JSON.parse(require("fs").readFileSync("stage/version.json")).version!=="1.526")process.exit(1)'
cp -a "$target" backup
rollback() {
  trap - ERR
  cp -a backup/. "$target/"
  echo "Restored previous frontend."
  exit 1
}
trap rollback ERR
# Keep previous hashed assets for browsers with an existing tab.
cp -a stage/. "$target/"
curl -fsS --max-time 20 "https://kingsmanagment.com/flight-system/version.json?t=$(date +%s)" |
  node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{if(JSON.parse(s).version!=="1.526")process.exit(1)})'
trap - ERR
echo "Frontend 1.526 activated; API and database untouched."
