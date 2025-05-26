FROM node:20-slim
FROM ghcr.io/puppeteer/puppeteer:^22.8.2

# Frissítjük a package listát és telepítjük a Chromium-ot + függőségeket
RUN apt-get update \
    && apt-get install -y \
       google-chrome-stable \ 
       fonts-ipafont-gothic \ 
       fonts-thai-tlwg \
       fonts-kacst \
       fonts-freefont-ttf
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


# Telepítsd a függőségeket - fontos: PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable \
    NODE_ENV=production



WORKDIR /app

# Másold át a package fájlokat
COPY package*.json ./

RUN npm ci --only=production

# Másold át a kódot
COPY . .

EXPOSE 3000
CMD ["npm", "start"]