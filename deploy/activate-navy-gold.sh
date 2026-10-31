#!/usr/bin/env bash
# Frontend-only release; preserve all historical assets, archives and backups.
set -Eeuo pipefail
cd "$(dirname "$0")"
target=/root/artifacts/flight-system/dist/public
exec 9>/root/releases/.deploy.lock
flock -n 9
sha256sum -c SHA256SUMS
available=$(df -Pk . | awk 'END{print $4}')
(( available > 153600 ))
mkdir stage backup
tar -xzf fms.tgz -C stage
node -e 'if(JSON.parse(require("fs").readFileSync("stage/version.json")).version!==process.argv[1])process.exit(1)' "${EXPECTED_FMS_VERSION:-1.536}"
grep -q '/flight-system/assets/' stage/index.html
python3 - "$target" <<'PY'
import os, sys, shutil
from pathlib import Path
paths, required = [], 0
for source in Path("stage").rglob("*"):
    if not source.is_file():
        continue
    relative = source.relative_to("stage")
    required += source.stat().st_size
    old = Path(sys.argv[1], relative)
    if old.is_file() or old.is_symlink():
        paths.append(os.fsencode(str(relative)))
        required += old.lstat().st_size
Path("backup/files").write_bytes(b"\0".join(paths) + (b"\0" if paths else b""))
if shutil.disk_usage(".").free < required + 100 * 1024 * 1024:
    raise SystemExit("Insufficient space for safe rollback")
PY
tar -czf backup/fms.tgz -C "$target" --null -T "$PWD/backup/files"
gzip -t backup/fms.tgz
restore() { trap - ERR; tar -xzf backup/fms.tgz -C "$target"; exit 1; }
trap restore ERR
cp -a stage/assets/. "$target/assets/"
find stage -mindepth 1 -maxdepth 1 ! -name assets ! -name index.html -exec cp -a {} "$target/" \;
cp stage/index.html "$target/.index-next.html"
chmod 644 "$target/.index-next.html"
mv "$target/.index-next.html" "$target/index.html"
curl -fsS --max-time 20 "https://kingsmanagment.com/flight-system/version.json?t=$(date +%s)" |
  node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{if(JSON.parse(s).version!==process.argv[1])process.exit(1)})' "${EXPECTED_FMS_VERSION:-1.536}"
trap - ERR
rm -rf stage
echo "Frontend ${EXPECTED_FMS_VERSION:-1.536} activated. API and booking-engine unchanged."
