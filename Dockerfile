FROM ghcr.io/puppeteer/puppeteer:20.8.1

# Establece directorio de trabajo
WORKDIR /app

# Copia los archivos
COPY . .

# Instala dependencias (usa npm o yarn si preferís)
RUN npm install

# Expone el puerto
EXPOSE 8080

# Comando de arranque
CMD ["npm", "start"]
