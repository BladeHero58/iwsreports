FROM node:18-slim

# Telepítjük a szükséges függőségeket
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Alkalmazás könyvtár létrehozása
WORKDIR /app

# Package.json és package-lock.json másolása
COPY package*.json ./

# Függőségek telepítése
RUN npm install

# Alkalmazás forráskódjának másolása
COPY . .

# Környezeti változók beállítása
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

# Port beállítása
EXPOSE 3000

# Alkalmazás indítása
CMD ["npm", "start"]