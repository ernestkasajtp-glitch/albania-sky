#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
exec 9>/root/releases/.deploy.lock
flock -n 9
sha256sum -c SHA256SUMS
API=/root/artifacts/api-server/dist
FMS=/root/artifacts/flight-system/dist/public
BE=/root/artifacts/booking-engine/dist/public
PM2=/usr/lib/node_modules/pm2/bin/pm2
(( $(df -Pk . | awk 'END{print $4}') > 1048576 ))
test ! -e backup/api.tgz
mkdir -p stage/api stage/fms stage/be backup
for app in api fms be; do tar -xzf "$app.tgz" -C "stage/$app"; done
for file in index.mjs excelWorker.mjs pino-worker.mjs pino-file.mjs pino-pretty.mjs thread-stream-worker.mjs; do test -s "stage/api/$file"; done
grep -q 'sendDailyAgentActivityReport' stage/api/index.mjs
grep -q '/flight-system/assets/' stage/fms/index.html
grep -q '/booking-engine/assets/' stage/be/index.html
tar -czf backup/api.tgz -C "$API" .
python3 - <<'PY'
from pathlib import Path
for app, target in [("fms","flight-system"),("be","booking-engine")]:
    src=Path("stage")/app; dst=Path("/root/artifacts")/target/"dist/public"
    paths=[str(p.relative_to(src)).encode() for p in src.rglob("*") if p.is_file() and (dst/p.relative_to(src)).is_file()]
    Path(f"backup/{app}-files").write_bytes(b"\0".join(paths)+b"\0")
PY
tar -czf backup/fms.tgz -C "$FMS" --null -T backup/fms-files
tar -czf backup/be.tgz -C "$BE" --null -T backup/be-files
gzip -t backup/api.tgz backup/fms.tgz backup/be.tgz
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
  tar -xzf backup/be.tgz -C "$BE"
  restart_api
  exit 1
}
trap rollback ERR
cp -a stage/api/. "$API/"
restart_api
install_frontend() {
  local src="$1" dst="$2"
  cp -a "$src/assets/." "$dst/assets/"
  find "$src" -mindepth 1 -maxdepth 1 ! -name assets ! -name index.html -exec cp -a {} "$dst/" \;
  cp "$src/index.html" "$dst/.activity-index-next.html"
  chmod 644 "$dst/.activity-index-next.html"
  mv "$dst/.activity-index-next.html" "$dst/index.html"
}
install_frontend stage/fms "$FMS"
install_frontend stage/be "$BE"
curl -fsS --max-time 20 "https://kingsmanagment.com/flight-system/version.json?t=$(date +%s)" |
  node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{if(JSON.parse(s).version!=="1.544")process.exit(1)})'
trap - ERR
rm -rf stage
echo 'Agent activity, PDF and daily reports activated; no schema migration or test emails.'
