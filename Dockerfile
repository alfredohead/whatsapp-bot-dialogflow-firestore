FROM browserless/chrome:latest
WORKDIR /app
COPY package.json ./
COPY package-lock.json ./
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
RUN npm install --omit=dev
COPY . .
EXPOSE 8080
CMD ["npm", "start"]
