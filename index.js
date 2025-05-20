// index.js
import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import chalk from 'chalk';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import { WebhookClient } from 'dialogflow-fulfillment';
import { SessionsClient } from '@google-cloud/dialogflow';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import OpenAI from 'openai';
import whatsappWeb from 'whatsapp-web.js';

const { Client, LocalAuth } = whatsappWeb;

// ——————————————————————————————————————
// 1. Carga de credenciales de servicio
// ——————————————————————————————————————
const firebaseCredentials = process.env.FIREBASE_JSON
  ? JSON.parse(
      Buffer.from(process.env.FIREBASE_JSON, 'base64').toString('utf8')
    )
  : JSON.parse(fs.readFileSync('./serviceAccount.json', 'utf8'));

// Inicializa Firebase
initializeApp({ credential: cert(firebaseCredentials) });
const firestore = getFirestore();

// Project ID de GCP
const projectId = process.env.GOOGLE_PROJECT_ID;

// ——————————————————————————————————————
// 2. Cliente de Dialogflow con credenciales explícitas
// ——————————————————————————————————————
const dfClient = new SessionsClient({
  projectId,
  credentials: {
    client_email: firebaseCredentials.client_email,
    private_key: firebaseCredentials.private_key
  }
});

// ——————————————————————————————————————
// 3. Cliente de OpenAI
// ——————————————————————————————————————
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ——————————————————————————————————————
// 4. Cliente de WhatsApp
// ——————————————————————————————————————
const whatsappClient = new Client({
  authStrategy: new LocalAuth({
    clientId: 'bot',
    dataPath: '/app/session' // montado desde el volumen "whatsapp_data"
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--disable-gpu'
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
  }
});

// ——————————————————————————————————————
// 5. Handlers de eventos de WhatsApp
// ——————————————————————————————————————
whatsappClient.on('qr', qr => {
  console.log(chalk.blue('🔍 [QR]') + ' Generating QR code:');
  qrcode.generate(qr, { small: true });
});

whatsappClient.on('ready', () =>
  console.log(chalk.green('✅ [WhatsApp]') + ' Client ready')
);

whatsappClient.on('message', async msg => {
  console.log(chalk.yellow('📥 [Message]'), msg.from, '-', msg.body);
  try {
    // Llamada a Dialogflow
    const sessionPath = dfClient.projectAgentSessionPath(projectId, msg.from);
    const [response] = await dfClient.detectIntent({
      session: sessionPath,
      queryInput: {
        text: { text: msg.body, languageCode: 'es' }
      }
    });
    const result = response.queryResult;

    // Almacena en Firestore
    await firestore.collection('messages').add({
      from: msg.from,
      text: msg.body,
      intent: result.intent?.displayName || 'Unknown',
      timestamp: new Date()
    });

    // Obtiene respuesta de Dialogflow o fallback a OpenAI
    let reply = result.fulfillmentText;
    if (!reply) {
      const chat = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Eres un asistente conversacional útil.' },
          { role: 'user', content: msg.body }
        ]
      });
      reply = chat.choices[0].message.content.trim();
    }

    // Envía el mensaje de vuelta
    await whatsappClient.sendMessage(msg.from, reply);
    console.log(chalk.magenta('📤 [Sent]'), reply);
  } catch (err) {
    console.error(chalk.red('❌ [Error]'), err);
  }
});

// ——————————————————————————————————————
// 6. Configuración de Express
// ——————————————————————————————————————
const app = express();
app.use(compression());
app.use(cors());
app.use(express.json());

app.get('/healthz', (_req, res) => res.send('OK'));

app.post('/dialogflow-webhook', (req, res) => {
  const agent = new WebhookClient({ request: req, response: res });
  const map = new Map([
    ['Default Welcome Intent', a => a.add('¡Hola! ¿En qué puedo ayudarte?')],
    ['Default Fallback Intent', a =>
      a.add('Lo siento, no entendí. ¿Podrías reformularlo?')
    ]
  ]);
  agent.handleRequest(map);
});

app.post('/send', async (req, res) => {
  const { numero, mensaje } = req.body;
  if (!numero || !mensaje) {
    return res.status(400).json({ error: 'Missing parameters' });
  }
  try {
    await whatsappClient.sendMessage(`${numero}@c.us`, mensaje);
    res.json({ success: true });
  } catch (err) {
    console.error(chalk.red('❌ [Error]'), err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ——————————————————————————————————————
// 7. Inicializa WhatsApp y arranca el servidor
// ——————————————————————————————————————
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

whatsappClient.initialize();
app.listen(PORT, HOST, () =>
  console.log(chalk.green('🚀 [Server]') + ` Listening on ${HOST}:${PORT}`)
);