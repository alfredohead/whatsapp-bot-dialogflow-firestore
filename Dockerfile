FROM browserless/chrome:latest

WORKDIR /app

COPY package*.json ./

# ✅ Soluciona permisos en package-lock.json
RUN npm install --omit=dev

COPY . .

EXPOSE 8080
CMD ["npm", "start"]

