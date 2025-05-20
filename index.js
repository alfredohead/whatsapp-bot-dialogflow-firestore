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
// 1. Carga y persistencia de credenciales
// ——————————————————————————————————————
let firebaseCredentials;
if (process.env.FIREBASE_JSON) {
  firebaseCredentials = JSON.parse(
    Buffer.from(process.env.FIREBASE_JSON, 'base64').toString('utf8')
  );
} else {
  firebaseCredentials = JSON.parse(
    fs.readFileSync('./serviceAccount.json', 'utf8')
  );
}

// Escribe un archivo temporal con las credenciales y apunta la variable
const gacPath = path.resolve('./gac.json');
fs.writeFileSync(gacPath, JSON.stringify(firebaseCredentials));
process.env.GOOGLE_APPLICATION_CREDENTIALS = gacPath;

initializeApp({ credential: cert(firebaseCredentials) });
const firestore = getFirestore();

const projectId = process.env.GOOGLE_PROJECT_ID;

// ——————————————————————————————————————
// 2. Inicialización de Dialogflow y OpenAI
// ——————————————————————————————————————
const dfClient = new SessionsClient({ projectId });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ——————————————————————————————————————
// 3. Cliente de WhatsApp
// ——————————————————————————————————————
const whatsappClient = new Client({
  authStrategy: new LocalAuth({
    clientId: 'bot',
    dataPath: '/app/session'
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
// 4. Handlers de WhatsApp
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
    const sessionPath = dfClient.projectAgentSessionPath(projectId, msg.from);
    const dfResponse = await dfClient.detectIntent({
      session: sessionPath,
      queryInput: { text: { text: msg.body, languageCode: 'es' } }
    });
    const result = dfResponse[0].queryResult;

    await firestore.collection('messages').add({
      from: msg.from,
      text: msg.body,
      intent: result.intent?.displayName || 'Unknown',
      timestamp: new Date()
    });

    let reply = result.fulfillmentText;
    if (!reply) {
      const chatRes = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Eres un asistente conversacional útil.' },
          { role: 'user', content: msg.body }
        ]
      });
      reply = chatRes.choices[0].message.content.trim();
    }

    await whatsappClient.sendMessage(msg.from, reply);
    console.log(chalk.magenta('📤 [Sent]'), reply);
  } catch (err) {
    console.error(chalk.red('❌ [Error]'), err);
  }
});

// ——————————————————————————————————————
// 5. Configuración de Express
// ——————————————————————————————————————
const app = express();
app.use(compression());
app.use(cors());
app.use(express.json());

app.get('/healthz', (_req, res) => res.send('OK'));

app.post('/dialogflow-webhook', (req, res) => {
  const agent = new WebhookClient({ request: req, response: res });
  const intentMap = new Map([
    ['Default Welcome Intent', a => a.add('¡Hola! ¿En qué puedo ayudarte?')],
    ['Default Fallback Intent', a =>
      a.add('Lo siento, no entendí. ¿Podrías reformularlo?')
    ]
  ]);
  agent.handleRequest(intentMap);
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
// 6. Arranque de WhatsApp y servidor
// ——————————————————————————————————————
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

whatsappClient.initialize();
app.listen(PORT, HOST, () =>
  console.log(chalk.green('🚀 [Server]') + ` Listening on ${HOST}:${PORT}`)
);

