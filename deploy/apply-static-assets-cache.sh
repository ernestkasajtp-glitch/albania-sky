#!/usr/bin/env bash
# User-run release step on the VPS; no database/API or rewrite changes.
set -Eeuo pipefail
cd "$(dirname "$0")"
HTTPD=/usr/local/apps/apache2/bin/httpd
CONF=/usr/local/apps/apache2/etc/conf.d/kingsmanagment.conf
[[ $(id -u) = 0 ]]
test -s "$CONF"
test -s static-assets-cache.conf
exec 7>/root/releases/.static-cache.lock
flock -n 7 || { echo "Nje konfigurim cache po punon."; exit 1; }
"$HTTPD" -t
"$HTTPD" -M 2>/dev/null | grep -q headers_module
"$HTTPD" -t -D DUMP_INCLUDES 2>&1 | grep -Fq "$CONF"
BACKUP="$PWD/apache-before-static-cache.conf"
test ! -e "$BACKUP"
cp -a "$CONF" "$BACKUP"
restore_cache_config() {
  trap - ERR
  cp -a "$BACKUP" "$CONF"
  "$HTTPD" -t && "$HTTPD" -k graceful
  echo "Cache nuk u aktivizua; konfigurimi Apache u rikthye. Aplikacioni mbetet i perditesuar."
  exit 1
}
trap restore_cache_config ERR
node - "$CONF" "$PWD/static-assets-cache.conf" <<'NODE'
const fs = require("fs");
const [config, fragment] = process.argv.slice(2);
const start = "# BEGIN FMS HASHED ASSET CACHE";
const end = "# END FMS HASHED ASSET CACHE";
const original = fs.readFileSync(config, "utf8");
let text = original;
if (text.includes(start) || text.includes(end)) {
  const begin = text.indexOf(start), finish = text.indexOf(end);
  if (begin < 0 || finish < begin || text.indexOf(start, begin + 1) >= 0 || text.indexOf(end, finish + 1) >= 0)
    throw new Error("Malformed managed cache block; refusing to edit");
  text = text.slice(0, begin) + text.slice(finish + end.length);
}
fs.writeFileSync(config, text.trimEnd() + "\n\n" + start + "\n" + fs.readFileSync(fragment, "utf8") + "\n" + end + "\n");
NODE
"$HTTPD" -t
"$HTTPD" -k graceful
ASSET=$(node -e 'const s=require("fs").readFileSync("/root/artifacts/booking-engine/dist/public/index.html","utf8");const m=s.match(/src="([^"]+\/assets\/[^"]+\.js)"/);if(!m)process.exit(1);console.log(m[1]);')
ok=0
for attempt in 1 2 3 4 5; do
  if curl -fsSI --max-time 15 "https://albaniasky.com${ASSET}" | grep -iq '^cache-control:.*immutable'; then ok=1; break; fi
  sleep 1
done
[[ "$ok" = 1 ]]
# The app shell must remain fresh; never cache it as an immutable asset.
shell_headers=$(curl -fsSI --max-time 15 https://albaniasky.com/booking-engine/)
if grep -iq '^cache-control:.*immutable' <<<"$shell_headers"; then
  restore_cache_config
fi
trap - ERR
echo "Cache i skedareve me hash u aktivizua. Kopja e Apache: $BACKUP"
