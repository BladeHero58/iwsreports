FROM node:18-slim

# Telepítjük a szükséges függőségeket a Chromiumhoz és a Puppeteerhez
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && apt-get install -y chromium-browser chromium-browser-dbg chromium-codecs-extra libu2f-udev fonts-freefont-ttf --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*
    # Hozzáadtam a 'chromium-browser' nevét és a kiegészítő függőségeket
    # A --no-install-recommends-et itt is megtarthatod, de ha gond van, ez az első, amit eltávolítanék.

# Alkalmazás könyvtár létrehozása
WORKDIR /app

# Package.json és package-lock.json másolása
COPY package*.json ./

# Függőségek telepítése
RUN npm install

# Alkalmazás forráskódjának másolása
COPY . .

# Környezeti változók beállítása (ezek már jól be vannak állítva a Renderen is)
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Port beállítása
EXPOSE 3000

# Alkalmazás indítása
CMD ["npm", "start"]