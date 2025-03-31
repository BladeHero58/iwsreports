# Használd a Node.js alapú image-et
FROM node:18

# Munkakönyvtár beállítása
WORKDIR /app

# Függőségek másolása
COPY package*.json ./

# Függőségek telepítése
RUN npm install

# Alkalmazás forráskódjának másolása
COPY . .

# Puppeteer telepítése
RUN npm install puppeteer

# Chrome telepítése
RUN apt-get update && apt-get install --no-install-recommends -y wget gnupg ca-certificates && \
    wget --quiet -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - && \
    sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' && \
    apt-get update && \
    apt-get install --no-install-recommends -y google-chrome-stable

# Puppeteer cache mappa beállítása
ENV PUPPETEER_CACHE_DIR=/tmp/puppeteer_cache
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Port beállítása (ha szükséges)
EXPOSE 3000

# Alkalmazás indítása
CMD [ "npm", "start" ]