#!/usr/bin/env bash
set -Eeuo pipefail
exec 9>/run/lock/fms-disk-watch.lock
flock -n 9 || exit 0
read -r available used_pct < <(df -B1 --output=avail,pcent / | tail -1 | tr -d '%')
inode_pct=$(df -Pi / | awk 'NR==2 {gsub(/%/,"",$5);print $5}')
[[ "$available" =~ ^[0-9]+$ && "$used_pct" =~ ^[0-9]+$ && "$inode_pct" =~ ^[0-9]+$ ]] || exit 1
severity="OK"
if (( used_pct >= 95 || inode_pct >= 95 || available < 1073741824 )); then
  severity="KRITIKE"
elif (( used_pct >= 85 || inode_pct >= 85 || available < 2147483648 )); then
  severity="PARALAJMËRIM"
fi
message="Disku: ${used_pct}% i përdorur; $((available / 1024 / 1024)) MB të lira; inode ${inode_pct}%. ${severity}. Nuk është fshirë asnjë dokument, backup apo version aplikacioni."
printf '%s\n' "$message"
[[ "${1:-}" == "--check" ]] && exit 0
if [[ "$severity" != "OK" ]]; then
  timeout 20 sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d kingsdb -v reason="$message" <<'SQL'
BEGIN;
SET LOCAL statement_timeout = '10s';
SELECT pg_advisory_xact_lock(hashtext('system:disk-space'));
UPDATE cp_import_alerts SET reason = :'reason'
 WHERE source = 'system:disk-space' AND resolved_at IS NULL;
INSERT INTO cp_import_alerts (kind, source, reason)
 SELECT 'connection', 'system:disk-space', :'reason'
 WHERE NOT EXISTS (SELECT 1 FROM cp_import_alerts WHERE source = 'system:disk-space' AND resolved_at IS NULL);
COMMIT;
SQL
else
  # Retain audit history, resolve only this monitor's own alerts after recovery.
  timeout 20 sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d kingsdb <<'SQL'
UPDATE cp_import_alerts SET resolved_at = NOW()
 WHERE source = 'system:disk-space' AND resolved_at IS NULL;
SQL
fi
