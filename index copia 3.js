const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const { WebhookClient } = require('dialogflow-fulfillment');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const dialogflow = require('@google-cloud/dialogflow');
const compression = require('compression');

// 🔐 Cargar credenciales desde variable de entorno o archivo
let firebaseCredentials;
try {
  if (process.env.FIREBASE_JSON) {
    firebaseCredentials = JSON.parse(
      Buffer.from(process.env.FIREBASE_JSON, 'base64').toString('utf8')
    );
  } else if (fs.existsSync('./credentials/firebase.json')) {
    firebaseCredentials = require('./credentials/firebase.json');
  } else {
    console.error('❌ FIREBASE_JSON no está definido y no se encontró credentials/firebase.json');
    process.exit(1);
  }
} catch (err) {
  console.error('❌ No se pudo cargar FIREBASE_JSON:', err.message);
  process.exit(1);
}

// 🔥 Inicializar Firebase
initializeApp({
  credential: cert(firebaseCredentials),
});
const db = getFirestore();

// 🧠 Inicializar cliente de Dialogflow una vez
const sessionClient = new dialogflow.SessionsClient({
  credentials: {
    client_email: firebaseCredentials.client_email,
    private_key: firebaseCredentials.private_key,
  },
  projectId: firebaseCredentials.project_id,
});
const sessionPaths = new Map();

// 🤖 Inicializar cliente de WhatsApp
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

// 🌐 Inicializar servidor Express
const app = express();
const port = process.env.PORT || 8080;
app.use(compression());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('🟢 Bot de WhatsApp corriendo');
});

// 🧠 Webhook para Dialogflow
app.post('/webhook', express.json(), (req, res) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: 'El cuerpo de la solicitud está vacío' });
  }

  const agentRequest = req.body;

  if (!agentRequest.queryResult || !agentRequest.queryResult.intent) {
    console.error('❌ La solicitud no contiene un intent válido:', JSON.stringify(agentRequest, null, 2));
    return res.status(400).json({ error: 'Solicitud inválida: falta queryResult.intent' });
  }

  const agent = new WebhookClient({ request: req, response: res });

  function welcome(agent) {
    agent.add(`Hola 👋, soy tu asistente virtual.`);
  }

  function fallback(agent) {
    agent.add(`No entendí eso. ¿Podés repetirlo?`);
  }

  const intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);

  agent.handleRequest(intentMap);
});

// 🟡 Inicializar WhatsApp
client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ Cliente de WhatsApp listo');
});

client.on('message', async (message) => {
  console.log(`📩 Mensaje recibido: ${message.body}`);
  const userId = message.from;
  const isGroup = userId.endsWith('@g.us');
  const contextoRef = db.collection('contextos').doc(userId);
  const contextoSnap = await contextoRef.get();
  const contexto = contextoSnap.exists ? contextoSnap.data() : {};

  if (isGroup) {
    if (message.body.toLowerCase() === 'bot') {
      await contextoRef.set({ modo: 'bot' });
      return message.reply('🤖 Bot activado en este grupo. ¿En qué puedo ayudarte?');
    }

    if (message.body.toLowerCase() === 'operador') {
      await contextoRef.set({ modo: 'humano' });
      return message.reply('🙋‍♂️ El bot fue desactivado. Estás hablando con un operador. Escribí "bot" para volver conmigo.');
    }

    if (contexto.modo !== 'bot') return;
  } else {
    if (message.body.toLowerCase() === 'operador') {
      await contextoRef.set({ modo: 'humano' });
      return message.reply('🙋‍♂️ Te derivamos con un operador humano. Escribí "bot" para volver conmigo.');
    }

    if (message.body.toLowerCase() === 'bot') {
      await contextoRef.set({ modo: 'bot' });
      return message.reply('🤖 Bot activado. ¿En qué puedo ayudarte?');
    }

    if (contexto.modo === 'humano') return;

    if (!contexto.modo) {
      await contextoRef.set({ modo: 'bot' });
    }
  }

  if (!message.body || typeof message.body !== 'string' || message.body.trim() === '') {
    console.warn('⚠️ Mensaje vacío o no válido, no se envía a Dialogflow');
    return;
  }

  if (!sessionPaths.has(userId)) {
    sessionPaths.set(userId, sessionClient.projectAgentSessionPath(firebaseCredentials.project_id, userId));
  }
  const sessionPath = sessionPaths.get(userId);

  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        text: message.body,
        languageCode: 'es',
      },
    },
  };

  try {
    const start = Date.now();
    const responses = await sessionClient.detectIntent(request);
    const duration = Date.now() - start;
    console.log(`⏱️ Dialogflow respondió en ${duration}ms`);

    const result = responses[0].queryResult;
    const reply = result.fulfillmentText || '🤖 Lo siento, no tengo una respuesta para eso.';
    await message.reply(reply);
    console.log(`🤖 Respuesta enviada: ${reply}`);
  } catch (error) {
    console.error('❌ Error al enviar mensaje a Dialogflow:', error);
    await message.reply('⚠️ Ocurrió un error. Intentá más tarde.');
  }
});

client.initialize();

// 🚀 Servidor Express
app.listen(port, () => {
  console.log(`🚀 Servidor Express activo en puerto ${port}`);
});
