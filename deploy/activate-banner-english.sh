#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
fms=/root/artifacts/flight-system/dist/public
be=/root/artifacts/booking-engine/dist/public
exec 9>/root/releases/.deploy.lock
flock -n 9
sha256sum -c SHA256SUMS
available=$(df -Pk . | awk 'END{print $4}')
(( available > 153600 ))
mkdir -p stage/fms stage/be backup
tar -xzf fms.tgz -C stage/fms
tar -xzf be.tgz -C stage/be
node -e 'if(JSON.parse(require("fs").readFileSync("stage/fms/version.json")).version!=="1.535")process.exit(1)'
grep -q '/flight-system/assets/' stage/fms/index.html
grep -q '/booking-engine/assets/' stage/be/index.html
# Back up exactly the files this release overwrites. All other live hashed
# assets and all earlier release backups remain untouched.
python3 - "$fms" "$be" <<'PY'
import os, sys, shutil
from pathlib import Path
required = 0
for name, target in zip(("fms", "be"), sys.argv[1:]):
    paths = []
    for source in Path("stage", name).rglob("*"):
        if not source.is_file():
            continue
        relative = source.relative_to(Path("stage", name))
        required += source.stat().st_size
        old = Path(target, relative)
        if old.is_file() or old.is_symlink():
            paths.append(os.fsencode(str(relative)))
            required += old.lstat().st_size
    Path("backup", name + ".files").write_bytes(b"\0".join(paths) + (b"\0" if paths else b""))
if shutil.disk_usage(".").free < required + 100 * 1024 * 1024:
    raise SystemExit("Insufficient space for safe scoped rollback and release")
PY
tar -czf backup/fms.tgz -C "$fms" --null -T "$PWD/backup/fms.files"
tar -czf backup/be.tgz -C "$be" --null -T "$PWD/backup/be.files"
gzip -t backup/fms.tgz backup/be.tgz
restore() { trap - ERR; tar -xzf backup/fms.tgz -C "$fms"; tar -xzf backup/be.tgz -C "$be"; exit 1; }
trap restore ERR
cp -a stage/fms/. "$fms/"
cp -a stage/be/. "$be/"
curl -fsS --max-time 20 "https://kingsmanagment.com/flight-system/version.json?t=$(date +%s)" |
  node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{if(JSON.parse(s).version!=="1.535")process.exit(1)})'
curl -fsS --max-time 20 https://kingsmanagment.com/booking-engine/ >/dev/null
trap - ERR
echo "Frontends 1.535 activated; API unchanged."
