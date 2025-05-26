# Use the official Puppeteer image which includes Node.js and a compatible Chromium
FROM ghcr.io/puppeteer/puppeteer:22.15.0


ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

ENV NODE_ENV=production


RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*


WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

 RUN npm ci --production --omit=dev




# Copy the rest of your application code
COPY . .


EXPOSE 3000
CMD ["google-chrome-stable"]

CMD ["npm", "start"]





