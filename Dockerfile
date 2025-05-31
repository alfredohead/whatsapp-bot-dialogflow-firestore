# Imagen base
<<<<<<< HEAD
FROM node:18-slim
=======
FROM node:20
>>>>>>> ac4794dc07619d934f1180cea54330ee0abef60e

# Install dependencies and Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-liberation \
    wget \
    gnupg \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

<<<<<<< HEAD
# Copy package files
=======
# Copiar los archivos de dependencias
>>>>>>> ac4794dc07619d934f1180cea54330ee0abef60e
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy rest of the application
COPY . .

<<<<<<< HEAD
# Set Puppeteer configurations
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

# Start the application
=======
# Puerto expuesto
EXPOSE 3000

# Comando de inicio
>>>>>>> ac4794dc07619d934f1180cea54330ee0abef60e
CMD ["node", "index.js"]