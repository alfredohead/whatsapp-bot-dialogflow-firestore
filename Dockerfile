FROM browserless/chrome:latest

# Crear directorio de la app
WORKDIR /app

# Copiar archivos como root para evitar conflictos de permisos
USER root
COPY . .

# Instalar solo dependencias de producción
RUN npm install --omit=dev

# Exponer el puerto usado por el servidor
EXPOSE 8080

# Comando para iniciar la app
CMD ["npm", "start"]

