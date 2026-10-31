#!/bin/bash
# ============================================================
# Ekzekutoni pasi të keni ngarkuar kodin dhe krijuar .env
# ============================================================

set -e
cd /var/www/fms

echo "[0/5] Ngarkimi i variablave te mjedisit nga .env..."
if [ -f .env ]; then
  set -a
  # shellcheck source=.env
  source .env
  set +a
else
  echo "KUJDES: skedari .env nuk u gjet! Sigurohuni qe e keni krijuar."
  exit 1
fi

echo "[1/5] Instalim dependencies..."
pnpm install --frozen-lockfile

echo "[2/5] Build i projektit..."
pnpm --filter @workspace/api-server run build

BASE_PATH=/flight-system/ pnpm --filter @workspace/flight-system run build
BASE_PATH=/ pnpm --filter @workspace/booking-engine run build

echo "[3/5] Inicializim database (migrime)..."
pnpm --filter @workspace/db run push

echo "[4/5] Konfigurим Nginx..."
sudo cp /var/www/fms/deploy/nginx.conf /etc/nginx/sites-available/fms
sudo ln -sf /etc/nginx/sites-available/fms /etc/nginx/sites-enabled/fms
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo "[5/5] Start aplikacionet me PM2..."
pm2 start /var/www/fms/deploy/ecosystem.config.js
pm2 save
pm2 startup | tail -1 | sudo bash

echo ""
echo "======================================"
echo " Sistemi u startua me sukses!"
echo ""
echo " Tani konfiguroni SSL:"
echo " sudo certbot --nginx -d kings-travel.tours -d www.kings-travel.tours"
echo "======================================"
