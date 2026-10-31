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
test ! -e backup/api.tgz
mkdir -p stage/api stage/fms backup
tar -xzf api.tgz -C stage/api
tar -xzf fms.tgz -C stage/fms
for file in index.mjs excelWorker.mjs pino-worker.mjs pino-file.mjs pino-pretty.mjs thread-stream-worker.mjs; do test -s "stage/api/$file"; done
grep -q '/flight-system/assets/' stage/fms/index.html
tar -czf backup/api.tgz -C "$API" .
python3 - <<'PY'
from pathlib import Path
src=Path("stage/fms"); dst=Path("/root/artifacts/flight-system/dist/public")
paths=[str(p.relative_to(src)).encode() for p in src.rglob("*") if p.is_file() and (dst/p.relative_to(src)).is_file()]
Path("backup/fms-files").write_bytes(b"\0".join(paths)+b"\0")
PY
tar -czf backup/fms.tgz -C "$FMS" --null -T backup/fms-files
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
cp -a stage/fms/assets/. "$FMS/assets/"
find stage/fms -mindepth 1 -maxdepth 1 ! -name assets ! -name index.html -exec cp -a {} "$FMS/" \;
cp stage/fms/index.html "$FMS/.index-user-link-next.html"
chmod 644 "$FMS/.index-user-link-next.html"
mv "$FMS/.index-user-link-next.html" "$FMS/index.html"
curl -fsS --max-time 20 "https://kingsmanagment.com/flight-system/version.json?t=$(date +%s)" |
  node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{if(JSON.parse(s).version!==process.argv[1])process.exit(1)})' "${EXPECTED_FMS_VERSION:-1.543}"
trap - ERR
rm -rf stage
echo 'User-agent linking activated; no database migration or portal changes.'
