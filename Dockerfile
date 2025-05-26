FROM ghcr.io/puppeteer/puppeteer:latest

WORKDIR /app

COPY package*.json ./
RUN npm install

RUN echo "Checking Chrome install..." && \
    ls -l /usr/bin/google-chrome-stable && \
    google-chrome-stable --version

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
