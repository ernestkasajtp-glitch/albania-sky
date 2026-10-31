#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
exec 9>/root/releases/.deploy.lock
flock -n 9
sha256sum -c SHA256SUMS
API=/root/artifacts/api-server/dist
PM2=/usr/lib/node_modules/pm2/bin/pm2
(( $(df -Pk . | awk 'END{print $4}') > 524288 ))
test ! -e backup/api.tgz
mkdir -p stage/api backup
tar -xzf api.tgz -C stage/api
for file in index.mjs excelWorker.mjs pino-worker.mjs pino-file.mjs pino-pretty.mjs thread-stream-worker.mjs; do test -s "stage/api/$file"; done
grep -q 'providerVerifiedUnpaid = false' stage/api/index.mjs
grep -q 'providerTerminal' stage/api/index.mjs
grep -q 'isProviderExpiredUnpaid' stage/api/index.mjs
tar -czf backup/api.tgz -C "$API" .
gzip -t backup/api.tgz
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
  restart_api
  exit 1
}
trap rollback ERR
cp -a stage/api/. "$API/"
restart_api
trap - ERR
rm -rf stage
echo 'POK link retry correction activated; no payment or booking mutation performed.'
