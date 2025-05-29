# Imagen base
FROM ghcr.io/puppeteer/puppeteer:20.9.0

USER root
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_ENV=production
ENV PORT=8080
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

CMD ["node", "index.js"]