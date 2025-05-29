# Imagen base
FROM ghcr.io/puppeteer/puppeteer:20.9.0

USER root
WORKDIR /app

# Install Chromium properly
RUN apt-get update && \
    apt-get install -y wget gnupg && \
    apt-get install -y chromium chromium-l10n && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PORT=8080

CMD ["node", "index.js"]