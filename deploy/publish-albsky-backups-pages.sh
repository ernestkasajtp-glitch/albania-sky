#!/usr/bin/env bash
# Publish only four informational files. No builds, migrations or service restarts.
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
for cmd in sshpass ssh scp sha256sum; do command -v "$cmd" >/dev/null || exit 1; done
: "${SSHPASS:?Mungon sekreti SSHPASS}"
SOURCE="artifacts/flight-system/public/albsky-backups"
FILES=(index.html privacy.html terms.html styles.css)
for f in "${FILES[@]}"; do test -s "$SOURCE/$f"; done
SERVER="root@69.57.163.245"
SSH=(sshpass -e ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)
SCP=(sshpass -e scp -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)
STAGE=$("${SSH[@]}" "$SERVER" 'umask 077; mktemp -d /tmp/albsky-pages.XXXXXXXX')
[[ "$STAGE" =~ ^/tmp/albsky-pages\.[A-Za-z0-9]+$ ]] || exit 1
cleanup() {
  "${SSH[@]}" "$SERVER" "rm -f '$STAGE/index.html' '$STAGE/privacy.html' '$STAGE/terms.html' '$STAGE/styles.css' '$STAGE/SHA256SUMS'; rmdir '$STAGE'" >/dev/null 2>&1 || true
}
trap cleanup EXIT
for f in "${FILES[@]}"; do "${SCP[@]}" "$SOURCE/$f" "$SERVER:$STAGE/$f"; done
(cd "$SOURCE"; sha256sum "${FILES[@]}") | "${SSH[@]}" "$SERVER" "umask 077; cat > '$STAGE/SHA256SUMS'"
"${SSH[@]}" "$SERVER" bash -s -- "$STAGE" <<'REMOTE'
set -Eeuo pipefail
stage=$1
web=/root/artifacts/flight-system/dist/public
target="$web/albsky-backups"
test -d "$web"
test ! -L "$target"
exec 9>/root/releases/.deploy.lock
flock -n 9 || { echo "Një publikim tjetër është aktiv."; exit 1; }
cd "$stage"
sha256sum -c SHA256SUMS
free=$(df -B1 --output=avail "$web" | tail -1 | tr -d ' ')
(( free > 2147483648 )) || { echo "Publikimi ndalohet: më pak se 2 GB të lira."; exit 1; }
before=$(sha256sum "$web/index.html" /root/artifacts/api-server/dist/index.mjs)
if test -e "$target"; then
  test -d "$target"
  test "$(du -sk "$target" | cut -f1)" -lt 1024
  test -z "$(find "$target" -mindepth 1 -maxdepth 1 ! -name index.html ! -name privacy.html ! -name terms.html ! -name styles.css -print -quit)"
  copy=$(mktemp -d /root/releases/albsky-pages-backup.XXXXXXXX)
  cp -a "$target" "$copy/"
fi
install -d -m 755 "$target"
for file in index.html privacy.html terms.html styles.css; do
  test ! -L "$target/$file"
  install -m 644 "$stage/$file" "$target/$file"
done
test "$before" = "$(sha256sum "$web/index.html" /root/artifacts/api-server/dist/index.mjs)"
for file in index.html privacy.html terms.html styles.css; do
  curl -fsS --max-time 20 "https://kingsmanagment.com/albsky-backups/$file" | cmp - "$stage/$file"
done
echo "Faqet u publikuan dhe përmbajtja u verifikua. Sistemi dhe API-ja nuk u ndryshuan."
echo "https://kingsmanagment.com/albsky-backups/index.html"
echo "https://kingsmanagment.com/albsky-backups/privacy.html"
echo "https://kingsmanagment.com/albsky-backups/terms.html"
REMOTE
