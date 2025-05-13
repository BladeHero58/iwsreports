FROM ghcr.io/puppeteer/puppeteer:21.5.0

# Set environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy application files
COPY . .

# List Chrome binary path to verify it exists
RUN ls -la /usr/bin/google-chrome-stable || echo "Chrome not found at expected path"

# Make sure Chrome is executable
RUN chmod +x /usr/bin/google-chrome-stable || echo "Failed to set permissions"

CMD [ "node", "server.js" ]