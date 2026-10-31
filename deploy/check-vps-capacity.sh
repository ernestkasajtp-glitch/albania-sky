#!/usr/bin/env bash
# Read-only deployment preflight. Arguments: new build + archives bytes, file count.
set -Eeuo pipefail
incoming=${1:-0}
files=${2:-0}
[[ "$incoming" =~ ^[0-9]+$ && "$files" =~ ^[0-9]+$ ]] || { echo "Invalid capacity estimate"; exit 2; }
for path in /root/artifacts/api-server/dist /root/artifacts/flight-system/dist/public /root/artifacts/booking-engine/dist/public /root/releases; do
  test -d "$path" || { echo "Missing deployment directory: $path"; exit 1; }
done
available=$(df -B1 --output=avail /root/releases | tail -1 | tr -d ' ')
inodes=$(df -Pi /root/releases | awk 'NR==2 {print $4}')
backup_kb=$(du -sk /root/artifacts/api-server/dist /root/artifacts/flight-system/dist/public /root/artifacts/booking-engine/dist/public | awk '{s+=$1} END {print s}')
backup_files=$(find /root/artifacts/api-server/dist /root/artifacts/flight-system/dist/public /root/artifacts/booking-engine/dist/public -xdev -print | wc -l)
reserve=$((2 * 1024 * 1024 * 1024))
required=$((reserve + backup_kb * 1024 + incoming + 256 * 1024 * 1024))
required_inodes=$((5000 + backup_files + files))
printf 'Kontrolli i diskut: të lira %s byte; kërkohen %s byte (përfshirë 2 GB rezervë).\n' "$available" "$required"
if (( available < required || inodes < required_inodes )); then
  echo "PUBLIKIMI U NDAL: hapësirë ose inode të pamjaftueshme. Nuk fshihet asgjë automatikisht."
  exit 1
fi
