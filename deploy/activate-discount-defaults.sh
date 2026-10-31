#!/usr/bin/env bash
# Frontend only. No API restart, database writes or migrations.
set -Eeuo pipefail
umask 022
cd "$(dirname "$0")"
target=/root/artifacts/flight-system/dist/public
exec 9>/root/releases/.deploy.lock
flock -n 9 || { echo "Nje publikim tjeter po punon."; exit 1; }
sha256sum -c SHA256SUMS
test -s "$target/index.html"
node -e 'const v=JSON.parse(require("fs").readFileSync(process.argv[1])).version;if(!["1.499","1.500"].includes(v))throw Error("Version i papritur: "+v)' "$target/version.json"
available=$(df -Pk . | awk 'END{print $4}')
needed=$(du -sk "$target" | awk '{print $1}')
(( available > needed * 3 + 102400 )) || { echo "Hapesire e pamjaftueshme."; exit 1; }
mkdir stage
tar -xzf fms.tgz -C stage
grep -q '/flight-system/assets/' stage/index.html
node -e 'if(JSON.parse(require("fs").readFileSync("stage/version.json")).version!=="1.500")process.exit(1)'
cp -a "$target" backup
rollback() {
  trap - ERR
  cp -a backup/. "$target/"
  echo "Verifikimi deshtoi; pamja e meparshme u rikthye."
  exit 1
}
trap rollback ERR
# Preserve old hashed assets for existing browser tabs.
cp -a stage/. "$target/"
curl -fsS --max-time 20 "https://kingsmanagment.com/flight-system/version.json?t=$(date +%s)" |
  node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{if(JSON.parse(s).version!=="1.500")process.exit(1)})'
trap - ERR
echo "Versioni 1.500 u aktivizua. API-ja dhe databaza nuk u preken."
