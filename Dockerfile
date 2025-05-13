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

# Chrome elérhetőségének ellenőrzése és szükség esetén telepítése
RUN if [ ! -f "/usr/bin/google-chrome-stable" ]; then \
      echo "Installing Chrome..."; \
      apt-get update && apt-get install -y wget; \
      wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb; \
      apt-get install -y ./google-chrome-stable_current_amd64.deb; \
      rm google-chrome-stable_current_amd64.deb; \
    fi

RUN google-chrome-stable --version || echo "Chrome still not installed correctly"

EXPOSE 3000

CMD [ "node", "server.js" ]