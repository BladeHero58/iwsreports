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
FROM node:20-slim # Vagy node:18-slim
# Itt nem telepítjük magát a chromium-browser csomagot, hanem csak a futási függőségeit.
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && apt-get install -y libnss3 libatk-bridge2.0-0 libxkbcommon0 libdrm-dev libgbm-dev libasound2 libfontconfig1 libcups2 libxtst6 libxss1 libdbus-1-3 libgconf-2-4 libgtk-3-0 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libxi6 libxinerama1 libxcursor1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install
COPY . .

ENV NODE_ENV=production
# EZEK A SOROK HIÁNYOZZANAK, VAGY LEGYENEK KOMMENTBE HELYEZVE:
# ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
# ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

EXPOSE 3000
CMD ["npm", "start"]