FROM node:18-slim

# Telepítjük a szükséges RENDSZERSZINTŰ függőségeket, amikre a Puppeteernek szüksége lehet
# a saját Chromium binárisának futtatásához.
# Itt nem telepítjük magát a chromium-browser csomagot, hanem csak a futási függőségeit.
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && apt-get install -y libnss3 libatk-bridge2.0-0 libxkbcommon0 libdrm-dev libgbm-dev libasound2 libfontconfig1 libcups2 libxtst6 libxss1 libdbus-1-3 libgconf-2-4 libgtk-3-0 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libxi6 libxinerama1 libxcursor1 \
    && rm -rf /var/lib/apt/lists/*

# Alkalmazás könyvtár létrehozása
WORKDIR /app

# Package.json és package-lock.json másolása
COPY package*.json ./

# Függőségek telepítése
# Ez a lépés telepíti a Puppeteer-t, és a Puppeteer maga fogja letölteni a Chromiumot
RUN npm install

# Alkalmazás forráskódjának másolása
COPY . .

# Környezeti változók beállítása
ENV NODE_ENV=production
# ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true   <-- EZEKET EL KELL TÁVOLÍTANI!
# ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser <-- EZEKET EL KELL TÁVOLÍTANI!

# Port beállítása
EXPOSE 3000

# Alkalmazás indítása
CMD ["npm", "start"]