<<<<<<< HEAD
FROM browserless/chrome:latest

# Establecer el directorio de trabajo
WORKDIR /app

# Copiar los archivos del proyecto
COPY . .

# Instalar solo las dependencias del proyecto
RUN npm install

# Exponer el puerto esperado por Railway
EXPOSE 8080

# Iniciar la app
=======
# Usa una imagen oficial de Node.js con tamaño reducido
FROM node:18-slim

# Configuración para evitar prompts durante instalación
ENV DEBIAN_FRONTEND=noninteractive

# Instalar dependencias necesarias para puppeteer
RUN apt-get update && apt-get install -y \
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

# Crear directorio de la app y copiar archivos
WORKDIR /app
COPY . .

# Instalar dependencias del proyecto
RUN npm install

# Exponer el puerto que usa la app
EXPOSE 8080

# Comando para iniciar el bot
>>>>>>> dbee644 (Agrega configuración para despliegue en Fly.io)
CMD ["npm", "start"]
