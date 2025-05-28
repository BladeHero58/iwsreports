FROM node:20-slim

# Install Chromium dependencies
RUN apt-get update && apt-get install -y \
  wget ca-certificates fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 libatk1.0-0 \
  libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libx11-xcb1 libxcomposite1 libxcursor1 \
  libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 xdg-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# Set environment so Puppeteer installs the correct Chrome version
ENV PUPPETEER_SKIP_DOWNLOAD=false
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# Pre-download Chromium during build
RUN npm ci --only=production && \
    npx puppeteer browsers install chrome

COPY . .

EXPOSE 3000

CMD ["npm", "start"]