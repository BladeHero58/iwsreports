FROM node:20-slim

# Install dependencies (if needed for Puppeteer runtime)
RUN apt-get update && apt-get install -y \
  fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 \
  libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libx11-xcb1 libxcomposite1 libxcursor1 \
  libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates \
  xdg-utils wget

WORKDIR /app

COPY package*.json ./

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
ENV PUPPETEER_CACHE_DIR=/tmp/puppeteer_cache

RUN npm ci --only=production

RUN mkdir -p /tmp/puppeteer_cache

RUN npx puppeteer install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]