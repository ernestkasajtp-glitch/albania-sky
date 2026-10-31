"""Remove byte-identical old build copies, never data or live assets.

Run on VPS without flags first, then --apply after reviewing the summary.
The newest three release directories are always retained.
"""
import hashlib
import json
import os
from pathlib import Path
import sys
import fcntl

apply = sys.argv[1:] == ["--apply"]
if sys.argv[1:] not in ([], ["--apply"]):
    raise SystemExit("Usage: prune-duplicate-release-assets.py [--apply]")
lock = open("/root/releases/.deploy.lock", "a")
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
releases = Path("/root/releases")
retained = {"navy-gold-1.536", "banner-1.535", "banner-1.534"}
safe_extensions = {".js", ".css", ".map", ".woff", ".woff2"}

def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.digest()

live = {}
for app in ("flight-system", "booking-engine"):
    for p in Path("/root/artifacts", app, "dist/public/assets").glob("*"):
        if p.is_file() and not p.is_symlink() and p.suffix in safe_extensions:
            live.setdefault(p.name, []).append((p, p.stat().st_size, digest(p)))

roots = [p for p in releases.iterdir()
         if p.is_dir() and not p.is_symlink() and p.name not in retained]
for app in ("flight-system", "booking-engine"):
    parent = Path("/root/artifacts", app)
    roots.extend(p for p in parent.glob("dist-backup-*") if p.is_dir() and not p.is_symlink())
    roots.extend(p for p in (parent / "dist").glob("public-backup-*") if p.is_dir() and not p.is_symlink())

count = total = 0
by_root = {}
for root in roots:
    for directory, dirs, files in os.walk(root, followlinks=False):
        dirs[:] = [d for d in dirs if not Path(directory, d).is_symlink()
                   and d not in {"uploads", "node_modules", "albsky-backups", ".git"}]
        if Path(directory).name != "assets":
            continue
        for name in files:
            p = Path(directory, name)
            if p.is_symlink() or p.suffix not in safe_extensions or name not in live:
                continue
            st = p.stat()
            matches = [(q, h) for q, size, h in live[name] if size == st.st_size]
            if not matches:
                continue
            fingerprint = digest(p)
            matching_live = next((q for q, h in matches if h == fingerprint), None)
            if matching_live is None:
                continue
            if apply:
                # Never remove the only copy: verify the live original again.
                current = p.stat()
                if digest(matching_live) != fingerprint or (
                    current.st_ino, current.st_size, current.st_mtime_ns
                ) != (st.st_ino, st.st_size, st.st_mtime_ns):
                    raise SystemExit("File changed during cleanup; stopped")
                p.unlink()
            count += 1
            total += st.st_size
            by_root[str(root)] = by_root.get(str(root), 0) + st.st_size
print(json.dumps({"applied": apply, "files": count, "GiB": round(total / 1024**3, 3),
                  "retained": sorted(retained),
                  "roots_GiB": {k: round(v / 1024**3, 3) for k, v in by_root.items()}}, indent=2))
