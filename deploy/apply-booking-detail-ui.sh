#!/usr/bin/env bash
# Frontend only: no database, API, PM2, mail, or shared configuration changes.
set -euo pipefail
umask 022
release_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
target=/root/artifacts/booking-engine/dist/public
archive="$release_dir/booking-detail-ui.tar.gz"

[[ "$(id -u)" = 0 ]] || { echo "Ekzekutojeni si root."; exit 1; }
[[ -f "$target/index.html" && -d "$target/assets" ]] || { echo "Portali ekzistues nuk u gjet. Nuk ndryshova asgje."; exit 1; }
for cmd in sha256sum tar flock cp mv mktemp; do command -v "$cmd" >/dev/null || exit 1; done
exec 9>/root/.booking-engine-ui-update.lock
flock -n 9 || { echo "Nje perditesim tjeter eshte duke punuar."; exit 1; }
cd "$release_dir"
sha256sum --check SHA256SUMS

# The generated archive contains only index.html and hashed frontend assets.
while IFS= read -r entry; do
  case "$entry" in
    index.html|assets|assets/|assets/*) ;;
    *) echo "Skedar i palejuar ne pakete: $entry"; exit 1 ;;
  esac
  [[ "$entry" != *".."* ]] || exit 1
done < <(tar -tzf "$archive")

stage="$(mktemp -d "$release_dir/.stage.XXXXXX")"
index_temp=""
trap 'rm -rf -- "$stage"; if [[ -n "$index_temp" ]]; then rm -f -- "$index_temp"; fi' EXIT
tar --no-same-owner -xzf "$archive" -C "$stage"
[[ -s "$stage/index.html" && -d "$stage/assets" ]] || exit 1
grep -q '/booking-engine/assets/' "$stage/index.html"
while IFS= read -r asset; do
  [[ -s "$stage/${asset#/booking-engine/}" ]] || { echo "Mungon asset: $asset"; exit 1; }
done < <(grep -oE '/booking-engine/assets/[^" ]+' "$stage/index.html")

if [[ "${1:-}" = "--check" ]]; then
  echo "Paketa dhe destinacioni jane ne rregull. Ende NUK eshte aktivizuar."
  exit 0
fi
[[ $# -eq 0 ]] || { echo "Argument i panjohur."; exit 1; }

backup="$release_dir/index-before-$(date -u +%Y%m%dT%H%M%S)-$$.html"
cp -p -- "$target/index.html" "$backup"
# Keep ALL old hashed files so old tabs and index rollback continue working.
cp -a -- "$stage/assets/." "$target/assets/"
index_temp="$(mktemp "$target/.index-update.XXXXXX")"
cp -- "$stage/index.html" "$index_temp"
chmod --reference="$target/index.html" "$index_temp"
chown --reference="$target/index.html" "$index_temp"
# Publish index LAST, with a same-filesystem atomic rename.
mv -f -- "$index_temp" "$target/index.html"
index_temp=""
echo "U aktivizua vetem pamja e portalit dhe faqezimi me 30 rezervime."
echo "Databaza, email-et, API-ja dhe paneli i brendshem nuk u preken."
echo "Kopja e index-it te vjeter: $backup"
echo "Asetet e vjetra jane ruajtur ne vend; asnje backup nuk u fshi."
