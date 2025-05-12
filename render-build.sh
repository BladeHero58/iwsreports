#!/bin/bash
set -e

# Adjunk futtatási engedélyt a puppeteer binárisnak
echo "Futtatási engedély adása a puppeteer binárisnak..."
chmod +x ./node_modules/.bin/puppeteer

# Telepítsd a szükséges függőségeket (ha még nem a Dockerfile-ban tetted)
echo "Függőségek telepítése..."
npm install

# Biztosítsd a Puppeteer cache könyvtár létezését
echo "Puppeteer cache könyvtár létrehozása..."
mkdir -p /tmp/puppeteer_cache

# Telepítsd a Puppeteer böngészőket a node_modules mappából futtatva
echo "Puppeteer böngészők telepítése..."
./node_modules/.bin/puppeteer browsers install chrome --cache-dir=/tmp/puppeteer_cache

# Tárold a Puppeteer cache-t a build cache-ben
echo "Puppeteer cache tárolása..."
if [ -d "/opt/render/project/cache" ]; then
  cp -r /tmp/puppeteer_cache /opt/render/project/cache/puppeteer
fi