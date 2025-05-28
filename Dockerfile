FROM node:20-alpine

# Install Chromium and necessary dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    nodejs \
    yarn \
    udev \
    bash

# Set Puppeteer environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy the rest of the application
COPY . .

# Chromium in Alpine is installed as chromium-browser
RUN echo "✅ Chromium path: $(which chromium-browser)" && chromium-browser --version

# Expose port and start app
EXPOSE 3000
CMD ["npm", "start"]