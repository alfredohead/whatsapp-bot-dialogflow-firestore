FROM node:18-slim

# Instalar dependencias necesarias para puppeteer y Chrome
RUN apt-get update && apt-get install -y     wget     ca-certificates     fonts-liberation     libappindicator3-1     libasound2     libatk-bridge2.0-0     libatk1.0-0     libcups2     libdbus-1-3     libgdk-pixbuf2.0-0     libnspr4     libnss3     libx11-xcb1     libxcomposite1     libxdamage1     libxrandr2     xdg-utils     --no-install-recommends  && rm -rf /var/lib/apt/lists/*

# Descargar e instalar Google Chrome
RUN wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - &&     echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list &&     apt-get update && apt-get install -y google-chrome-stable &&     rm -rf /var/lib/apt/lists/*

# Crear directorio de la app
WORKDIR /app

# Copiar archivos de la app
COPY . .

# Instalar dependencias
RUN npm install --omit=dev

# Exponer el puerto
EXPOSE 8080

# Comando de inicio
CMD ["npm", "start"]
