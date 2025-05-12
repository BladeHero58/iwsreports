FROM ghcr.io/puppeteer/puppeteer:latest

# Alkalmazás munkakönyvtára
WORKDIR /app

# package.json és package-lock.json másolása, majd telepítés
COPY package*.json ./
RUN npm install

# Összes fájl bemásolása
COPY . .

# Alkalmazás futtatásához szükséges port
EXPOSE 3000

# Indítási parancs
CMD ["npm", "start"]