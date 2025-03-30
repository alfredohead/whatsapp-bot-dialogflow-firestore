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
CMD ["npm", "start"]
