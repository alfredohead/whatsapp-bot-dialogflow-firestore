# Usa una imagen base oficial de Node.js
FROM node:18-slim

# Evita mensajes interactivos al instalar paquetes
ENV DEBIAN_FRONTEND=noninteractive

# Instala las dependencias necesarias para Puppeteer y Google Chrome
RUN apt-get update && \
    apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Instala Google Chrome estable
RUN wget -q -O google-chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && \
    apt-get update && \
    apt-get install -y ./google-chrome.deb && \
    rm google-chrome.deb

# Crea el directorio de la app
WORKDIR /app

# Copia los archivos de la app
COPY . .

# Instala las dependencias
RUN npm install

# Expone el puerto
EXPOSE 8080

# Comando para iniciar la aplicación
CMD ["npm", "start"]