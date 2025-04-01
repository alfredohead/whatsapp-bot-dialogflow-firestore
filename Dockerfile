# Imagen base
FROM node:20

# Crear directorio de trabajo
WORKDIR /app

# Copiar los archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto de los archivos
COPY . .

# Puerto expuesto si usás express para testing
EXPOSE 3000

# Comando de inicio
CMD ["node", "index.js"]
