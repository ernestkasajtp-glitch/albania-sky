"""Apply only the approved page background to the currently served portal CSS."""
import hashlib
import os
import re
from pathlib import Path
from datetime import datetime, timezone
import fcntl

root = Path("/root/artifacts/booking-engine/dist/public")
with open("/root/.booking-engine-ui-update.lock", "a") as lock:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    index = root / "index.html"
    html = index.read_text()
    matches = re.findall(r'href="(/booking-engine/assets/[^"]+\.css)"', html)
    if len(matches) != 1:
        raise RuntimeError("Expected exactly one portal stylesheet; no changes applied")
    old_url = matches[0]
    original = (root / old_url.removeprefix("/booking-engine/")).read_text()
    rule = "\n/* Approved flight search and booking page canvas only. */\n.air-shell:has(.air-flights),.air-shell:has(.air-booking),.air-portal.air-flights,.air-portal.air-booking{background:#e3e5e8}\n"
    updated = original if rule in original else original + rule
    digest = hashlib.sha256(updated.encode()).hexdigest()[:12]
    new_url = f"/booking-engine/assets/portal-grey-{digest}.css"
    target = root / new_url.removeprefix("/booking-engine/")
    target.write_text(updated)
    target.chmod(0o644)
    backup = Path("/root/portal-style-backups")
    backup.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    (backup / f"index-before-grey-{stamp}.html").write_text(html)
    temp = root / ".index-grey-update.html"
    temp.write_text(html.replace(old_url, new_url))
    temp.chmod(index.stat().st_mode)
    os.replace(temp, index)
    print("CSS activated:", new_url)
    print("Existing JavaScript, old assets, API and data unchanged.")
