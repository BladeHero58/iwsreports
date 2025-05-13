FROM ghcr.io/puppeteer/puppeteer:24.8.2

# Szükséges könyvtárak telepítése
USER root
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-khmeros fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Munkamappa beállítása
WORKDIR /usr/src/app

# Chrome és puppeteer környezeti változók beállítása
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Node alkalmazás telepítése
COPY package*.json ./
RUN npm ci
COPY . .

# Alkalmazás indítása
CMD ["node", "server.js"]