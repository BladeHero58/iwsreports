# Használj egy Puppeteer-hez optimalizált alap image-et
# Ellenőrizd a legfrissebb stabil verziót a Puppeteer Docker Hub-on: https://hub.docker.com/r/puppeteer/puppeteer/tags
FROM puppeteer/puppeteer:21.6.0

# Használj egy Puppeteer-hez optimalizált alap image-et
# Ellenőrizd a legfrissebb stabil verziót a Puppeteer Docker Hub-on: https://hub.docker.com/r/puppeteer/puppeteer/tags
FROM puppeteer/puppeteer:21.6.0

WORKDIR /app

# Másold át a package fájlokat
COPY package*.json ./

# Telepítsd a függőségeket
# Nincs szükség PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false itt, mivel az image már tartalmazza.
RUN npm ci --only=production

# Másold át a kódot
COPY . .

# Állítsd be a Node.js környezetet production-re
ENV NODE_ENV=production

# Expose a port, ahol az alkalmazásod hallgat
EXPOSE 3000

# Indítsd el az alkalmazást a package.json "start" szkriptjével
CMD ["npm", "start"]