FROM node:20-slim

# Chromium futtatásához szükséges függőségek
RUN apt-get update && apt-get install -y \
  wget \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libgdk-pixbuf2.0-0 \
  libnspr4 \
  libnss3 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  xdg-utils \
  --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

# App mappa
WORKDIR /app

# Csomagok
COPY package*.json ./
RUN npm install

# Forráskód
COPY . .

# Port
EXPOSE 3000

# Indítás
CMD ["npm", "start"]