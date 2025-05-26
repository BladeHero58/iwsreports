# Use the official Puppeteer image which includes Node.js and a compatible Chromium
FROM ghcr.io/puppeteer/puppeteer:^22.8.2

# The base image already has Chromium and its dependencies.
# You only need to install additional fonts if your application specifically requires them
# and they are not already in the base image.
RUN apt-get update && apt-get install -y \
    fonts-ipafont-gothic \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    # Add any other truly essential packages NOT already in the base puppeteer image
    && rm -rf /var/lib/apt/lists/*

# PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true is important because the base image already provides Chromium.
# We don't want npm install to download another one.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
# The ghcr.io/puppeteer/puppeteer image typically sets the executable path correctly.
# By default, it's usually /usr/bin/google-chrome.
# Remove your custom PUPPETEER_EXECUTABLE_PATH or set it to what the base image provides.
# If you remove it, Puppeteer will use the one configured by the base image.
# ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome # This is usually the default in the image
ENV NODE_ENV=production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install project dependencies.
# Ensure 'puppeteer' is listed in your package.json 'dependencies' (not just devDependencies)
# as your production code will need it to control the browser.
RUN npm ci --only=production

# Copy the rest of your application code
COPY . .

# The puppeteer image might already run as a non-root user (e.g., 'puppeteer').
# If you need to change permissions or ownership, do it before switching user.
# USER puppeteer # Uncomment if you want to ensure it runs as the 'puppeteer' user

EXPOSE 3000

CMD ["npm", "start"]
