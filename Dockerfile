# Use the official Puppeteer image which includes Node.js and a compatible Chromium
FROM ghcr.io/puppeteer/puppeteer:22.15.0


ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

ENV NODE_ENV=production

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

 RUN npm ci --production --omit=dev




# Copy the rest of your application code
COPY . .


EXPOSE 3000

CMD ["npm", "start"]
