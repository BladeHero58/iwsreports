FROM node:20-slim # Vagy node:18-slim, de maradjunk a 20-nál, ha azt használod
# Telepítjük a szükséges RENDSZERSZINTŰ függőségeket, amikre a Puppeteernek szüksége lehet
# a saját Chromium binárisának futtatásához.
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && apt-get install -y libnss3 libatk-bridge2.0-0 libxkbcommon0 libdrm-dev libgbm-dev libasound2 libfontconfig1 libcups2 libxtst6 libxss1 libdbus-1-3 libgconf-2-4 libgtk-3-0 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libxi6 libxinerama1 libxcursor1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install
COPY . .

ENV NODE_ENV=production

EXPOSE 3000
CMD ["npm", "start"]