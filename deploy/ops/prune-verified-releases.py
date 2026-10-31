#!/usr/bin/env python3
"""Explicit manual cleanup, only after a verified backup; dry run by default."""
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
if not __debug__:
    raise SystemExit("Refusing cleanup with Python assertions disabled.")

os.umask(0o077)
backup = Path(sys.argv[1])
apply = len(sys.argv) == 3 and sys.argv[2] == "--apply"
if len(sys.argv) not in (2, 3) or (len(sys.argv) == 3 and not apply):
    raise SystemExit("Usage: script /root/backups/verified-TIMESTAMP [--apply]")
assert re.fullmatch(r"/root/backups/verified-\d{8}_\d{6}", str(backup))
assert not backup.is_symlink() and (backup / "VERIFIED").is_file()
manifest = (backup / "manifest.txt").read_text()
assert "restore_test=PASSED" in manifest and "archive_integrity=PASSED" in manifest
subprocess.run(["sha256sum", "-c", "SHA256SUMS"], cwd=backup, check=True)
lock = open("/root/releases/.deploy.lock", "a")
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
root = Path("/root/releases")
releases = sorted(p for p in root.iterdir() if p.is_dir() and not p.is_symlink()
                  and re.fullmatch(r"flight-alerts-\d{8}-\d{6}", p.name))
keep = releases[-3:]
allowed = {"api-backup", "web-backup", "api-new", "web-new", "api.tgz", "web.tgz",
           "public-index.html", "public-version.json", "new-index.html", "check-capacity.sh"}
def sensitive(name):
    p = Path(name)
    return any(s.lower() in {"uploads", "private", "pgdata", "backups", ".env"} for s in p.parts) or \
        bool(re.search(r"\.(sql|dump|backup)(\.|$)", name, re.I))

eligible, skipped = [], []
for path in releases[:-3]:
    try:
        assert {p.name for p in path.iterdir()} <= allowed
        assert (path / "api-backup").is_dir() and (path / "web-backup").is_dir()
        for base, dirs, files in os.walk(path, followlinks=False):
            for name in dirs + files:
                item = Path(base) / name
                assert not item.is_symlink() and not sensitive(str(item.relative_to(path)))
        for name in ("api.tgz", "web.tgz"):
            if (path / name).exists():
                with tarfile.open(path / name, "r:gz") as archive:
                    assert all(not sensitive(m.name) and not m.issym() and not m.islnk() for m in archive)
        eligible.append(str(path))
    except (AssertionError, tarfile.TarError):
        skipped.append(str(path))

plan = {"backup": str(backup), "preserve_latest_three": [str(p) for p in keep],
        "eligible_old_application_releases": eligible, "skipped": skipped}
print(json.dumps(plan, indent=2))
if apply:
    # Keep an audit of the exact paths. No glob deletion and no traversal elsewhere.
    (backup / "release-cleanup.json").write_text(json.dumps(plan, indent=2))
    for name in eligible:
        path = Path(name)
        assert path.parent == root and not path.is_symlink()
        shutil.rmtree(path)
    print(f"Removed {len(eligible)} older application releases; preserved {len(keep)} latest releases.")
else:
    print("DRY RUN: nothing removed.")
