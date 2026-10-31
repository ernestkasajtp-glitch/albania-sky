#!/usr/bin/env bash
# Frontend-only release. No API, database, process or Apache changes.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
pnpm --filter @workspace/booking-engine run typecheck
BASE_PATH=/booking-engine/ pnpm --filter @workspace/booking-engine run build
grep -q '/booking-engine/assets/' artifacts/booking-engine/dist/public/index.html
[[ "${1:-}" != "--check" ]] || exit 0
host="${VPS_HOST:-root@69.57.163.245}"
release="b2b-home-$(date -u +%Y%m%d%H%M%S)"
out="generated-artifacts/$release"
mkdir -p "$out"
tar -czf "$out/booking-engine.tgz" -C artifacts/booking-engine/dist/public .
sha="$(sha256sum "$out/booking-engine.tgz" | cut -d' ' -f1)"
ssh_cmd=(ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
scp_cmd=(scp -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
if [[ -n "${SSHPASS:-}" ]]; then
  ssh_cmd=(sshpass -e "${ssh_cmd[@]}")
  scp_cmd=(sshpass -e "${scp_cmd[@]}")
fi
"${ssh_cmd[@]}" "$host" "mkdir -p /root/releases/$release"
"${scp_cmd[@]}" "$out/booking-engine.tgz" "$host:/root/releases/$release/"
"${ssh_cmd[@]}" "$host" bash -s -- "$release" "$sha" <<'REMOTE'
set -Eeuo pipefail
release="/root/releases/$1"
dest=/root/artifacts/booking-engine/dist/public
cd "$release"
echo "$2  booking-engine.tgz" | sha256sum -c -
test "$(df --output=avail -k "$dest" | tail -1)" -gt 102400
mkdir stage
tar -xzf booking-engine.tgz -C stage
grep -q '/booking-engine/assets/' stage/index.html
# Back up only files overwritten by this release. Old hashed assets stay available.
while IFS= read -r -d '' file; do
  rel="${file#stage/}"
  if [[ -f "$dest/$rel" ]]; then printf '%s\0' "$rel"; fi
done < <(find stage -type f -print0) > overwritten.list
tar -czf before.tgz -C "$dest" --null -T overwritten.list
chmod 600 before.tgz
rollback() { tar -xzf "$release/before.tgz" -C "$dest"; rm -rf "$release/stage"; }
trap rollback ERR
find stage -type f ! -name index.html -print0 | while IFS= read -r -d '' file; do
  rel="${file#stage/}"; mkdir -p "$dest/$(dirname "$rel")"; cp "$file" "$dest/$rel"
done
cp stage/index.html "$dest/index.html.next"
mv "$dest/index.html.next" "$dest/index.html"
curl -fsS https://albaniasky.com/booking-engine/ > served.html
cmp stage/index.html served.html
for asset in $(grep -oE '/booking-engine/assets/[^"]+' stage/index.html); do
  curl -fsS -o /dev/null "https://albaniasky.com$asset"
done
curl -fsS https://kingsmanagment.com/api/healthz
trap - ERR
rm -rf stage served.html overwritten.list
echo
echo "Activated $release; package and rollback backup retained."
REMOTE
