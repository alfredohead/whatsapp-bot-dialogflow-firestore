require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs');
const { WebhookClient } = require('dialogflow-fulfillment');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// 🔐 Credenciales Firebase
let firebaseCredentials;
if (process.env.FIREBASE_JSON) {
  firebaseCredentials = JSON.parse(process.env.FIREBASE_JSON);
} else if (fs.existsSync('./credentials/firebase.json')) {
  firebaseCredentials = require('./credentials/firebase.json');
} else {
  console.error('❌ FIREBASE_JSON no está definido y no se encontró credentials/firebase.json');
  process.exit(1);
}

// 🔐 Credenciales Dialogflow
let dialogflowCredentials;
if (process.env.DIALOGFLOW_JSON) {
  dialogflowCredentials = JSON.parse(process.env.DIALOGFLOW_JSON);
} else if (fs.existsSync('./credentials/dialogflow.json')) {
  dialogflowCredentials = require('./credentials/dialogflow.json');
} else {
  console.error('❌ DIALOGFLOW_JSON no está definido y no se encontró credentials/dialogflow.json');
  process.exit(1);
}

initializeApp({ credential: cert(firebaseCredentials) });
const db = getFirestore();

const app = express();
app.use(express.json());

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

let currentQR = null;

client.on('qr', (qr) => {
  currentQR = qr;
  console.log('🟢 QR Code generado!');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ Client is ready!');
});

console.log("🟡 Inicializando cliente de WhatsApp...");
client.initialize().then(() => {
  console.log("🟢 Cliente inicializado exitosamente (con promesa).");
}).catch(err => {
  console.error("❌ Error al inicializar el cliente:", err);
});

const sessionCollection = db.collection('sessions');

client.on('message', async (message) => {
  const sessionRef = sessionCollection.doc(message.from);
  const sessionSnap = await sessionRef.get();
  const sessionData = sessionSnap.exists ? sessionSnap.data() : {};

  const context = {
    parameters: sessionData.parameters || {},
    area: sessionData.area || null,
    context: sessionData.context || null,
  };

  const webhookClient = new WebhookClient({ request: { body: { queryResult: { queryText: message.body } } }, response: {} });

  webhookClient.context = context;

  webhookClient.handleRequest({
    async fallback(agent) {
      const text = agent.query;
      await client.sendMessage(message.from, `🤖 Dijiste: ${text}`);
    },
  });

  await sessionRef.set({
    parameters: webhookClient.context.parameters,
    area: webhookClient.context.area,
    context: webhookClient.context.context,
  });
});

app.get('/', (req, res) => {
  res.send('Servidor activo. Escaneá el QR en consola.');
});

app.get('/qr', (req, res) => {
  if (currentQR) {
    res.send(`<pre>${currentQR}</pre>`);
  } else {
    res.send('QR no disponible. Asegurate de que el cliente se está inicializando.');
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Servidor Express activo en puerto ${PORT}`);
});