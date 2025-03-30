FROM browserless/chrome:latest

# Crear directorio de trabajo
WORKDIR /app

# Copiar solo package.json para evitar errores de permisos
COPY package.json ./

# Instalar dependencias de producción (sin lockfile)
RUN npm install --omit=dev

# Copiar el resto del proyecto
COPY . .

# Exponer el puerto usado por la app
EXPOSE 8080

# Iniciar la app
CMD ["npm", "start"]
