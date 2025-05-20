// index.js
// Asegúrate de tener "type": "module" en tu package.json

import 'dotenv/config';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import { Client, LocalAuth } from 'whatsapp-web.js';
import express from 'express';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import compression from 'compression';
import cors from 'cors';
import chalk from 'chalk';
import { WebhookClient } from 'dialogflow-fulfillment';
import { SessionsClient } from '@google-cloud/dialogflow';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import OpenAI from 'openai';

// 🔐 Cargar credenciales de Firebase
let firebaseCredentials;
if (process.env.FIREBASE_JSON) {
  firebaseCredentials = JSON.parse(
    Buffer.from(process.env.FIREBASE_JSON, 'base64').toString('utf8')
  );
} else if (fs.existsSync('./serviceAccount.json')) {
  firebaseCredentials = JSON.parse(fs.readFileSync('./serviceAccount.json', 'utf8'));
} else {
  console.error(chalk.red('❌ [Error] No se encontraron credenciales de Firebase'));
  process.exit(1);
}
initializeApp({ credential: cert(firebaseCredentials) });
const firestore = getFirestore();

// Configuración de Dialogflow
const projectId = process.env.GOOGLE_PROJECT_ID;
const dfClient = new SessionsClient();

// Configuración de OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Inicialización de cliente de WhatsApp
const whatsappClient = new Client({
  authStrategy: new LocalAuth({ clientId: 'bot' }),
  puppeteer: { headless: true }
});

// Eventos de WhatsApp
whatsappClient.on('qr', qr => {
  console.log(chalk.blue('🔍 [QR]') + ' QR recibido, generando con qrcode-terminal:');
  qrcode.generate(qr, { small: true });
});
whatsappClient.on('ready', () => console.log(chalk.green('✅ [WhatsApp] Cliente listo')));

// Manejo de mensajes entrantes
whatsappClient.on('message', async msg => {
  console.log(chalk.yellow('📥 [Mensaje recibido]'), msg.from, '-', msg.body);
  try {
    // 1) Procesar en Dialogflow
    const sessionPath = dfClient.projectAgentSessionPath(projectId, msg.from);
    const dfResponse = await dfClient.detectIntent({
      session: sessionPath,
      queryInput: { text: { text: msg.body, languageCode: 'es' } }
    });
    const queryResult = dfResponse[0].queryResult;

    // 2) Guardar en Firestore
    await firestore.collection('messages').add({
      from: msg.from,
      text: msg.body,
      intent: queryResult.intent?.displayName || 'Desconocido',
      timestamp: new Date()
    });
    console.log(chalk.cyan('💾 [Firestore]') + ' Mensaje guardado con intent:', queryResult.intent?.displayName);

    // 3) Obtener respuesta: Dialogflow o OpenAI fallback
    let reply = queryResult.fulfillmentText;
    if (!reply) {
      console.log(chalk.magenta('🤖 [OpenAI]') + ' ChatGPT fallback');
      const chatRes = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Eres un asistente conversacional útil.' },
          { role: 'user', content: msg.body }
        ]
      });
      reply = chatRes.choices[0].message.content.trim();
    }

    // 4) Enviar respuesta
    await whatsappClient.sendMessage(msg.from, reply);
    console.log(chalk.magenta('📤 [Respuesta enviada]'), reply);
  } catch (error) {
    console.error(chalk.red('❌ [Error procesando mensaje]'), error);
  }
});

whatsappClient.initialize();

// --- Express HTTP Server ---
const app = express();
const PORT = process.env.PORT || 3000;

app.use(compression());
app.use(cors());
app.use(express.json());

// Ruta de salud
app.get('/healthz', (_req, res) => res.send('OK'));

// Webhook para Dialogflow fulfillment
app.post('/dialogflow-webhook', (req, res) => {
  console.log(chalk.blue('🌐 [Webhook]') + ' Llamada a /dialogflow-webhook');
  const agent = new WebhookClient({ request: req, response: res });

  function welcome(agent) {
    agent.add('¡Hola! ¿En qué puedo ayudarte?');
  }
  function fallback(agent) {
    agent.add('Lo siento, no entendí. ¿Podrías reformularlo?');
  }

  const intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);

  agent.handleRequest(intentMap);
});

// Endpoint para que el operador envíe mensajes
app.post('/send', async (req, res) => {
  console.log(chalk.blue('👤 [Operador]') + ' Solicitud /send');
  const { numero, mensaje } = req.body;
  if (!numero || !mensaje) {
    console.warn(chalk.yellow('⚠️ [Warning]') + ' Parámetros faltantes en /send');
    return res.status(400).json({ error: 'Faltan parámetros' });
  }
  try {
    const chatId = `${numero}@c.us`;
    await whatsappClient.sendMessage(chatId, mensaje);
    console.log(chalk.green('✅ [Operador]') + ' Mensaje enviado a', numero);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error(chalk.red('❌ [Error Operador]') + ' No se pudo enviar el mensaje', err);
    res.status(500).json({ error: 'No se pudo enviar el mensaje' });
  }
});

// Iniciar servidor HTTP
app.listen(PORT, () => console.log(chalk.green('🚀 [Server]') + ` Escuchando en puerto ${PORT}`));
