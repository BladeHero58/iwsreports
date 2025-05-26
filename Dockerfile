FROM ghcr.io/puppeteer/puppeteer:latest

# Set working directory
WORKDIR /app

# Copy your app files
COPY package*.json ./
RUN npm install

COPY . .

# Optional: Set Puppeteer executable path (usually not needed if using their image)
# ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

EXPOSE 3000
CMD ["npm", "start"]
