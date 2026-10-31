#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
exec 9>/root/releases/.deploy.lock
flock -n 9
sha256sum -c SHA256SUMS
API=/root/artifacts/api-server/dist
FMS=/root/artifacts/flight-system/dist/public
PM2=/usr/lib/node_modules/pm2/bin/pm2
(( $(df -Pk . | awk 'END{print $4}') > 524288 ))
mkdir -p stage/api stage/fms backup
tar -xzf api.tgz -C stage/api
tar -xzf fms.tgz -C stage/fms
node -e 'if(JSON.parse(require("fs").readFileSync("stage/fms/version.json")).version!=="1.541")process.exit(1)'
tar -czf backup/api.tgz -C "$API" .
python3 - "$FMS" <<'PY'
import os,sys
from pathlib import Path
paths=[os.fsencode(str(f.relative_to("stage/fms"))) for f in Path("stage/fms").rglob("*") if f.is_file() and Path(sys.argv[1],f.relative_to("stage/fms")).exists()]
Path("backup/fms-files").write_bytes(b"\0".join(paths)+b"\0")
PY
tar -czf backup/fms.tgz -C "$FMS" --null -T "$PWD/backup/fms-files"
gzip -t backup/api.tgz backup/fms.tgz
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
    if curl -fsS --max-time 4 http://127.0.0.1:3000/api/healthz >/dev/null 2>&1; then return; fi
    sleep 2
  done
  return 1
}
rollback() {
  trap - ERR
  tar -xzf backup/api.tgz -C "$API"
  tar -xzf backup/fms.tgz -C "$FMS"
  restart_api
  exit 1
}
trap rollback ERR
cp -a stage/api/. "$API/"
restart_api
cp -a stage/fms/. "$FMS/"
curl -fsS --max-time 20 "https://kingsmanagment.com/flight-system/version.json?t=$(date +%s)" |
  node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{if(JSON.parse(s).version!=="1.541")process.exit(1)})'
trap - ERR
echo 'Google classification 1.541 activated'
