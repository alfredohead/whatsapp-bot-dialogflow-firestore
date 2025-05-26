FROM node:18-alpine

# Instalar dependencias necesarias para Puppeteer y Chromium
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    dumb-init

# Definir la ruta del ejecutable de Chromium para Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Crear directorio de trabajo
WORKDIR /app

# Copiar e instalar dependencias del proyecto
COPY package.json ./
RUN npm install

# Copiar el resto del proyecto
COPY . .

# Exponer el puerto del servidor Express
EXPOSE 8080

# Ejecutar la app con manejo adecuado de procesos
CMD ["dumb-init", "npm", "start"]

