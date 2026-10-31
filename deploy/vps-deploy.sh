#!/bin/bash
# ============================================================
# VPS Deploy Script - kingsmanagment.com
# Ekzekutoni: bash /root/deploy/vps-deploy.sh
# ============================================================

set -e

PM2=/usr/lib/node_modules/pm2/bin/pm2
ROOT=/root
ECOSYSTEM="$ROOT/artifacts/api-server/ecosystem.config.cjs"

echo ""
echo "================================================"
echo "  KINGS TRAVEL FMS - VPS Deploy"
echo "================================================"
echo ""

if [ ! -f "$ROOT/pnpm-workspace.yaml" ]; then
  echo "GABIM: Nuk jam ne drejtorine e sakte!"
  echo "Sigurohuni qe kodi eshte ne /root/"
  exit 1
fi

cd "$ROOT"

# ============================================================
# [1/5] Instalo dependencies
# ============================================================
echo "[1/5] Duke instaluar dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# ============================================================
# [2/5] Build API Server
# ============================================================
echo ""
echo "[2/5] Duke ndertuar API server..."
pnpm --filter @workspace/api-server run build

# ============================================================
# [3/5] Build Frontends
# ============================================================
echo ""
echo "[3/5] Duke ndertuar Flight System..."
BASE_PATH=/flight-system/ pnpm --filter @workspace/flight-system run build

echo "      Duke ndertuar Booking Engine..."
BASE_PATH=/booking-engine/ pnpm --filter @workspace/booking-engine run build

# ============================================================
# [4/5] Migrimet e databazës
# ============================================================
echo ""
echo "[4/5] Duke aplikuar migrimet e databazës..."
pnpm --filter @workspace/db run push || echo "KUJDES: Kontrolloni DB manualisht!"

# ============================================================
# [5/5] Rinis PM2
# ============================================================
echo ""
echo "[5/5] Duke rinisur PM2..."
if $PM2 list 2>/dev/null | grep -q "api-server"; then
  $PM2 reload "$ECOSYSTEM" --update-env
else
  $PM2 start "$ECOSYSTEM"
fi
$PM2 save

# ============================================================
echo ""
echo "================================================"
echo "  DEPLOY U KRYE ME SUKSES!"
echo ""
echo "  Flight System:  https://kingsmanagment.com/flight-system/"
echo "  Booking Engine: https://kingsmanagment.com/"
echo "================================================"
echo ""
