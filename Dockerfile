FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

RUN rm -rf node_modules && npm install # Explicit törlés és újratelepítés

COPY . .

RUN apk add --no-cache wget gnupg ca-certificates && \
    wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - && \
    sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list' && \
    apt-get update && \
    apt-get install -y google-chrome-stable --no-install-recommends

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV PUPPETEER_EXECUTABLE_PATH /usr/bin/google-chrome

EXPOSE 3000

CMD ["npm", "start"]