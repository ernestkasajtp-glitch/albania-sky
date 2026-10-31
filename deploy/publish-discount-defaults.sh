#!/usr/bin/env bash
# Run from Replit Shell. --check builds/verifies locally without touching VPS.
set -Eeuo pipefail
trap 'echo "Perditesimi u ndal ne rreshtin $LINENO (kodi $?)." >&2' ERR
cd "$(dirname "$0")/.."
host="${VPS_HOST:-root@69.57.163.245}"
ssh_cmd=(ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
scp_cmd=(scp -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
if [[ -n "${SSHPASS:-}" ]]; then
  ssh_cmd=(sshpass -e "${ssh_cmd[@]}")
  scp_cmd=(sshpass -e "${scp_cmd[@]}")
fi
# Check connectivity before spending time on a build.
if [[ "${1:-}" != "--check" ]]; then
  "${ssh_cmd[@]}" "$host" 'echo "Lidhja me VPS OK"'
fi
pnpm --filter @workspace/flight-system run test:flight-discount
pnpm --filter @workspace/flight-system exec tsc --noEmit
BASE_PATH=/flight-system/ pnpm --filter @workspace/flight-system run build
grep -q '/flight-system/assets/' artifacts/flight-system/dist/public/index.html
node -e 'if(JSON.parse(require("fs").readFileSync("artifacts/flight-system/dist/public/version.json")).version!=="1.500")process.exit(1)'
if [[ "${1:-}" = "--check" ]]; then
  echo "Kontrollet 1.500 perfunduan; VPS nuk u prek."
  exit 0
fi
stage="$(mktemp -d /tmp/discount-defaults.XXXXXX)"
trap 'rm -rf -- "$stage"' EXIT
tar -czf "$stage/fms.tgz" -C artifacts/flight-system/dist/public .
cp deploy/activate-discount-defaults.sh "$stage/activate.sh"
(cd "$stage"; sha256sum fms.tgz activate.sh > SHA256SUMS)
remote="/root/releases/discount-defaults-1.500-$(date +%Y%m%d-%H%M%S)"
"${ssh_cmd[@]}" "$host" "mkdir -p '$remote'"
"${scp_cmd[@]}" "$stage/"* "$host:$remote/"
"${ssh_cmd[@]}" "$host" "bash '$remote/activate.sh'"
echo "Kopja e meparshme: $remote/backup"
