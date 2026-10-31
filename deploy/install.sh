#!/bin/bash
# ============================================================
# Skript instalimi për FMS Pro + Booking Engine
# Ubuntu 22.04 LTS — Namecheap VPS
# ============================================================

set -e
echo "======================================"
echo " FMS Pro — Instalim automatik"
echo "======================================"

# ── 1. Përditëso sistemin ──────────────────────────────────
echo "[1/8] Përditësim sistemi..."
sudo apt update && sudo apt upgrade -y

# ── 2. Instalo Node.js 20 ─────────────────────────────────
echo "[2/8] Instalim Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# ── 3. Instalo pnpm, pm2, serve ───────────────────────────
echo "[3/8] Instalim pnpm + pm2 + serve..."
sudo npm install -g pnpm pm2 serve

# ── 4. Instalo PostgreSQL ─────────────────────────────────
echo "[4/8] Instalim PostgreSQL..."
sudo apt install -y postgresql postgresql-contrib

# ── 5. Instalo Nginx ──────────────────────────────────────
echo "[5/8] Instalim Nginx..."
sudo apt install -y nginx certbot python3-certbot-nginx

# ── 6. Krijo database ─────────────────────────────────────
echo "[6/8] Krijim database..."
sudo -u postgres psql <<SQL
CREATE USER fmsuser WITH PASSWORD 'NDRYSHO_KETE_FJALEKALIM';
CREATE DATABASE fmsdb OWNER fmsuser;
GRANT ALL PRIVILEGES ON DATABASE fmsdb TO fmsuser;
SQL

# ── 7. Krijo direktorinë e projektit ──────────────────────
echo "[7/8] Përgatitje direktorie..."
sudo mkdir -p /var/www/fms
sudo chown $USER:$USER /var/www/fms

echo ""
echo "======================================"
echo " Instalimi bazë u krye me sukses!"
echo "======================================"
echo ""
echo " Hapat e ardhshëm:"
echo " 1. Ngarkoni kodin te /var/www/fms"
echo " 2. Krijoni skedarin .env"
echo " 3. Ekzekutoni: deploy/setup.sh"
echo "======================================"
