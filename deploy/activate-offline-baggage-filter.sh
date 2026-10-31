#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
exec 9>/root/releases/.deploy.lock
flock -n 9
sha256sum -c SHA256SUMS
(( $(df -Pk . | awk 'END{print $4}') > 262144 ))
mkdir stage backup
tar -xzf api.tgz -C stage
test -s stage/excelWorker.mjs
API=/root/artifacts/api-server/dist
PM2=/usr/lib/node_modules/pm2/bin/pm2
tar -czf backup/api.tgz -C "$API" .
gzip -t backup/api.tgz
health() {
  for i in $(seq 1 40); do
    if curl -fsS --max-time 4 http://127.0.0.1:3000/api/healthz >/dev/null 2>&1; then return; fi
    sleep 2
  done
  return 1
}
restore() {
  trap - ERR
  tar -xzf backup/api.tgz -C "$API"
  "$PM2" restart api-server --update-env
  health
  exit 1
}
trap restore ERR
cp -a stage/. "$API/"
"$PM2" restart api-server --update-env
health
curl -fsS --max-time 20 https://kingsmanagment.com/api/healthz
trap - ERR
rm -rf stage
echo 'Offline baggage classification activated; frontend unchanged.'
