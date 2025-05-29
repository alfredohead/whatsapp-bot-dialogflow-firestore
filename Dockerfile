# Imagen base
FROM ghcr.io/puppeteer/puppeteer:20.9.0

USER root
WORKDIR /app

# Copiar los archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto de los archivos
COPY . .

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Comando de inicio
CMD ["node", "index.js"]