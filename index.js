const express = require("express");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const dialogflow = require("@google-cloud/dialogflow");
const fs = require("fs");
const { Firestore } = require("@google-cloud/firestore");

// Express setup
const app = express();
const PORT = process.env.PORT || 8080;

app.get("/", (req, res) => {
  res.send("Servidor funcionando correctamente 🚀");
});

// QR endpoint
let qrCodeImage = "";
app.get("/qr", (req, res) => {
  if (qrCodeImage) {
    res.send(`<img src="${qrCodeImage}" />`);
  } else {
    res.send("QR no generado todavía.");
  }
});

// Firestore setup
const firestore = new Firestore();
console.log("✅ Firestore conectado correctamente");

// Dialogflow setup
const sessionClient = new dialogflow.SessionsClient({
  keyFilename: "./credenciales-dialogflow.json", // Ajustar según tu proyecto
});
const projectId = (await sessionClient.getProjectId());

// WhatsApp client setup
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", (qr) => {
  qrcode.toDataURL(qr, (err, url) => {
    qrCodeImage = url;
    console.log("⚠️ Escaneá el QR desde: /qr");
  });
});

client.on("ready", () => {
  console.log("✅ WhatsApp Web conectado");
});

client.on("message", async (message) => {
  if (!message.body) return;

  const sessionPath = sessionClient.projectAgentSessionPath(projectId, message.from);
  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        text: message.body,
        languageCode: "es",
      },
    },
  };

  try {
    const responses = await sessionClient.detectIntent(request);
    const result = responses[0].queryResult;
    if (result && result.fulfillmentText) {
      await message.reply(result.fulfillmentText);
    }
  } catch (error) {
    console.error("🛑 Error con Dialogflow:", error);
    await message.reply("Ocurrió un error al procesar tu mensaje.");
  }
});

client.initialize();

// Iniciar Express
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor Express corriendo en el puerto ${PORT}`);
});

