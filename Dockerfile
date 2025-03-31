# Imagen base de Node.js
FROM node:18

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos necesarios
COPY package.json ./
COPY package-lock.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto de archivos
COPY . .

# Exponer el puerto que Fly.io espera
EXPOSE 8080

# Comando para iniciar la app
CMD ["npm", "start"]
