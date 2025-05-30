# Imagen base
FROM node:18-slim

# Install Chrome dependencies and Chrome
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-liberation \
    google-chrome-stable \
    --no-install-recommends

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy rest of the application
COPY . .

# Set environment variables
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
ENV NODE_ENV=production

# Start the application
CMD ["node", "index.js"]