FROM ghcr.io/puppeteer/puppeteer:24.8.2

# Puppeteer környezeti változók
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /usr/src/app

# Csomag fájlok másolása és függőségek telepítése
COPY package*.json ./
RUN npm ci

# A többi fájl másolása
COPY . .

# Portok nyitása (opcionális, ha szükséges)
EXPOSE 3000

# A Chrome tényleges útvonalának ellenőrzése
RUN ls -la /usr/bin/google-chrome-stable || echo "Chrome nem található a megadott helyen!"

CMD [ "node", "server.js" ]