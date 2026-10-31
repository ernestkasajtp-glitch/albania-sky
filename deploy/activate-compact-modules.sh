#!/usr/bin/env bash
# Frontend only. No API restart, database or module-state changes.
set -Eeuo pipefail
umask 022
cd "$(dirname "$0")"
VERSION="${RELEASE_VERSION:-1.517}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+$ ]]
target=/root/artifacts/flight-system/dist/public
exec 9>/root/releases/.deploy.lock
flock -n 9
sha256sum -c SHA256SUMS
available=$(df -Pk . | awk 'END{print $4}')
needed=$(du -sk "$target" | awk '{print $1}')
(( available > needed * 3 + 262144 ))
mkdir stage backup
tar -xzf fms.tgz -C stage
grep -q '/flight-system/assets/' stage/index.html
node -e 'if(JSON.parse(require("fs").readFileSync("stage/version.json")).version!==process.argv[1])process.exit(1)' "$VERSION"
cp -a "$target/." backup/
# Retain old hashed assets for existing browser tabs; index is switched last.
cp -a stage/assets/. "$target/assets/"
for file in stage/*; do
  [[ -f "$file" && "$(basename "$file")" != index.html ]] || continue
  cp -p "$file" "$target/"
done
cp stage/index.html "$target/.index-modules-new"
chmod 644 "$target/.index-modules-new"
mv "$target/.index-modules-new" "$target/index.html"
curl -fsS --max-time 20 "https://kingsmanagment.com/flight-system/version.json?t=$(date +%s)" |
  node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{if(JSON.parse(s).version!==process.argv[1])process.exit(1)})' "$VERSION"
echo "Frontend $VERSION activated; backend and module states untouched."
