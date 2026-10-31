#!/usr/bin/env bash
# Run as root on the VPS. Never restores into the live database and deletes no backups.
set -Eeuo pipefail
umask 077
exec 9>/run/lock/fms-verified-backup.lock
flock -n 9 || { echo "A backup is already running."; exit 1; }
exec 8>/root/releases/.deploy.lock
flock -n 8 || { echo "A deployment is running; retry backup after it finishes."; exit 1; }
stamp=$(date -u +%Y%m%d_%H%M%S)
backup="/root/backups/verified-$stamp"
verify_db="fms_verify_$stamp"
files=(
  root/artifacts/api-server/dist root/artifacts/api-server/uploads root/artifacts/api-server/.env
  root/artifacts/api-server/ecosystem.config.cjs root/artifacts/flight-system/dist/public
  root/artifacts/booking-engine/dist root/artifacts/uploads root/deploy root/.pm2/dump.pm2
  usr/local/apps/apache2/etc etc/apache2 etc/letsencrypt etc/postgresql etc/cron.d
  etc/systemd/journald.conf.d usr/local/sbin/fms-disk-watch
)
test ! -e /root/artifacts/api-server/private || files+=(root/artifacts/api-server/private)
for f in "${files[@]}"; do test -e "/$f" || { echo "Required backup path missing: /$f"; exit 1; }; done
available=$(df -B1 --output=avail /root/backups | tail -1 | tr -d ' ')
size=$(du -sk "${files[@]/#//}" | awk '{s+=$1} END {printf "%.0f",s*1024}')
dbsize=$(sudo -u postgres psql -XAt -d kingsdb -c 'SELECT pg_database_size(current_database())')
required=$((size + dbsize * 3 + 1073741824))
(( available > required )) || { echo "Not enough headroom for safe backup and isolated verification."; exit 1; }
mkdir -m 700 "$backup"
cleanup() {
  if [[ "$verify_db" =~ ^fms_verify_[0-9]{8}_[0-9]{6}$ ]]; then
    sudo -u postgres dropdb --if-exists "$verify_db" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
printf 'backup_started_utc=%s\nlive_database=kingsdb\n' "$(date -u +%FT%TZ)" > "$backup/manifest.txt"
echo "Creating consistent database snapshot..."
nice -n 10 sudo -u postgres pg_dump -Fc -Z3 --serializable-deferrable kingsdb > "$backup/database.dump.part"
test -s "$backup/database.dump.part"
pg_restore --list "$backup/database.dump.part" > "$backup/database-contents.txt"
mv "$backup/database.dump.part" "$backup/database.dump"
sudo -u postgres pg_dumpall --globals-only > "$backup/database-roles.sql.part"
test -s "$backup/database-roles.sql.part"
mv "$backup/database-roles.sql.part" "$backup/database-roles.sql"
echo "Archiving active documents, applications and private configuration..."
nice -n 10 tar -C / -czf "$backup/files.tar.gz.part" "${files[@]}" 2>"$backup/archive.log"
test -s "$backup/files.tar.gz.part"
gzip -t "$backup/files.tar.gz.part"
tar -tzf "$backup/files.tar.gz.part" > "$backup/file-list.txt"
mv "$backup/files.tar.gz.part" "$backup/files.tar.gz"
echo "Testing restore into an isolated temporary database..."
sudo -u postgres createdb -T template0 "$verify_db"
sudo -u postgres pg_restore --exit-on-error --no-owner --no-acl -d "$verify_db" \
  < "$backup/database.dump" > "$backup/restore.log" 2>&1
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d "$verify_db" >> "$backup/manifest.txt" <<'SQL'
BEGIN READ ONLY;
SELECT 'bookings' AS entity, count(*) FROM bookings
UNION ALL SELECT 'passengers', count(*) FROM passengers
UNION ALL SELECT 'payments', count(*) FROM payments
UNION ALL SELECT 'agents', count(*) FROM agents
UNION ALL SELECT 'flights', count(*) FROM flights;
COMMIT;
SQL
sudo -u postgres dropdb "$verify_db"
verify_db=""
(
  cd "$backup"
  sha256sum database.dump database-roles.sql files.tar.gz > SHA256SUMS
  sha256sum -c SHA256SUMS
)
printf 'restore_test=PASSED\narchive_integrity=PASSED\ncompleted_utc=%s\n' "$(date -u +%FT%TZ)" >> "$backup/manifest.txt"
touch "$backup/VERIFIED"
chmod 600 "$backup"/*
printf 'VERIFIED_BACKUP=%s\n' "$backup"
du -sh "$backup"
