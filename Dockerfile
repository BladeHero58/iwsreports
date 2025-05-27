FROM node:20-slim

# Frissítjük a package listát és telepítjük a Chromium-ot + függőségeket
RUN apt-get update \
    && apt-get install -y \
       chromium \
       fonts-liberation \
       libappindicator3-1 \
       libasound2 \
       libatk-bridge2.0-0 \
       libatk1.0-0 \
       libcups2 \
       libdbus-1-3 \
       libdrm2 \
       libgbm1 \
       libgtk-3-0 \
       libnspr4 \
       libnss3 \
       libx11-xcb1 \
       libxcomposite1 \
       libxcursor1 \
       libxdamage1 \
       libxext6 \
       libxfixes3 \
       libxi6 \
       libxrandr2 \
       libxrender1 \
       libxss1 \
       libxtst6 \
       ca-certificates \
       fonts-liberation \
       libappindicator1 \
       libnss3 \
       lsb-release \
       xdg-utils \
       wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Másold át a package fájlokat
COPY package*.json ./

# Telepítsd a függőségeket - fontos: PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
RUN npm ci --only=production

# Másold át a kódot
COPY . .

# Állítsd be a Puppeteer konfigurációt
#ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

ENV NODE_ENV=production

EXPOSE 3000
CMD ["npm", "start"]