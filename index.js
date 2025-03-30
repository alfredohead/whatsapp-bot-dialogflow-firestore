const express = require("express");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 8080;

let qrCodeDataUrl = null;

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-gpu"
    ],
    executablePath: "/usr/bin/google-chrome", // asegúrate que existe en Docker
  },
});

client.on("qr", (qr) => {
  console.log("⚠️ Escaneá el QR desde: /qr");
  qrcode.toDataURL(qr, (err, url) => {
    if (err) {
      console.error("❌ Error generando el código QR", err);
      return;
    }
    qrCodeDataUrl = url;
  });
});

client.on("ready", () => {
  console.log("✅ Cliente de WhatsApp listo");
});

client.on("auth_failure", (msg) => {
  console.error("❌ Falló la autenticación:", msg);
});

client.on("disconnected", (reason) => {
  console.warn("🔌 Cliente desconectado:", reason);
});

client.initialize();

app.get("/", (req, res) => {
  res.send("Servidor funcionando correctamente 🚀");
});

app.get("/qr", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (qrCodeDataUrl) {
    res.send(`
      <html>
        <head>
          <title>Escaneá el QR</title>
          <meta http-equiv="refresh" content="10">
          <style>
            body { font-family: sans-serif; text-align: center; margin-top: 50px; }
            img { width: 300px; height: 300px; }
          </style>
        </head>
        <body>
          <h1>Escaneá el QR para iniciar sesión</h1>
          <img src="${qrCodeDataUrl}" alt="Código QR" />
          <p>La página se actualiza cada 10 segundos.</p>
        </body>
      </html>
    `);
  } else {
    res.send("QR no disponible todavía. Intentá de nuevo en unos segundos.");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor Express corriendo en el puerto ${PORT}`);
});

