FROM node:18

# Instala dependencias necesarias para Chrome
RUN apt-get update && apt-get install -y \
    wget gnupg unzip fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 \
    libatk1.0-0 libcups2 libdbus-1-3 libgdk-pixbuf2.0-0 libnspr4 libnss3 libx11-xcb1 \
    libxcomposite1 libxdamage1 libxrandr2 xdg-utils libu2f-udev libvulkan1 \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Descarga Google Chrome estable
RUN wget -O chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && \
    apt install -y ./chrome.deb && \
    rm chrome.deb

# Crea el directorio de trabajo
WORKDIR /app

# Copia package.json y package-lock.json
COPY package*.json ./

# Instala dependencias de la app
RUN npm install

# Copia el resto del código
COPY . .

# Usa el puerto de Railway
ENV PORT=8080

# Expone el puerto para el contenedor
EXPOSE 8080

# Comando de inicio
CMD ["npm", "start"]

