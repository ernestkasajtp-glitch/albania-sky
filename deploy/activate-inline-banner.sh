#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
target=/root/artifacts/flight-system/dist/public
exec 9>/root/releases/.deploy.lock
flock -n 9
sha256sum -c SHA256SUMS
mkdir stage
tar -xzf fms.tgz -C stage
node -e 'if(JSON.parse(require("fs").readFileSync("stage/version.json")).version!=="1.530")process.exit(1)'
grep -q '/flight-system/assets/' stage/index.html
available=$(df -Pk . | awk 'END{print $4}')
needed=$(du -sk "$target" | awk '{print $1}')
(( available > needed * 2 + 102400 ))
cp -a "$target" backup
restore() { trap - ERR; cp -a backup/. "$target/"; exit 1; }
trap restore ERR
cp -a stage/. "$target/"
curl -fsS --max-time 20 "https://kingsmanagment.com/flight-system/version.json?t=$(date +%s)" |
  node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{if(JSON.parse(s).version!=="1.530")process.exit(1)})'
trap - ERR
echo "Frontend 1.530 activated; backend untouched."
