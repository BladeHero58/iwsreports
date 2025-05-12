#!/bin/bash
set -e

# Telepítsd a szükséges függőségeket (ha még nem a Dockerfile-ban tetted)
echo "Függőségek telepítése..."
npm install

# Biztosítsd a Puppeteer cache könyvtár létezését
echo "Puppeteer cache könyvtár létrehozása..."
mkdir -p /tmp/puppeteer_cache

# Telepítsd a Puppeteer böngészőket
echo "Puppeteer böngészők telepítése..."
npx puppeteer browsers install chrome --cache-dir=/tmp/puppeteer_cache

# Tárold a Puppeteer cache-t a build cache-ben
echo "Puppeteer cache tárolása..."
if [ -d "/opt/render/project/cache" ]; then
  cp -r /tmp/puppeteer_cache /opt/render/project/cache/puppeteer
fi