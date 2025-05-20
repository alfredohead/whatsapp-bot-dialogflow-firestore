// index.js
import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import chalk from 'chalk';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import { WebhookClient } from 'dialogflow-fulfillment';
import { SessionsClient } from '@google-cloud/dialogflow';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import OpenAI from 'openai';
import whatsappWeb from 'whatsapp-web.js';

const { Client, LocalAuth } = whatsappWeb;

// ——————————————————————————————————————
// 1. Carga de credenciales de Firebase (desde env FIREBASE_JSON)
// ——————————————————————————————————————
const firebaseCredentials = process.env.FIREBASE_JSON
  ? JSON.parse(Buffer.from(process.env.FIREBASE_JSON, 'base64').toString('utf8'))
  : JSON.parse(fs.readFileSync('./serviceAccount.json', 'utf8'));

initializeApp({ credential: cert(firebaseCredentials) });
const firestore = getFirestore();

// ——————————————————————————————————————
// 2. Dialogflow con credenciales explícitas
// ——————————————————————————————————————
const projectId = process.env.GOOGLE_PROJECT_ID;
const dfClient = new SessionsClient({
  projectId,
  credentials: {
    client_email: firebaseCredentials.client_email,
    private_key: firebaseCredentials.private_key
  }
});

// ——————————————————————————————————————
// 3. OpenAI
// ——————————————————————————————————————
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ——————————————————————————————————————
// 4. WhatsApp-Web.js y persistencia de sesión
// ——————————————————————————————————————
const whatsappClient = new Client({
  authStrategy: new LocalAuth({
    clientId: 'bot',
    dataPath: '/app/session'   // Debe coincidir con fly.toml destination
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
// 5. Handlers de WhatsApp
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
    // Detecta intent en Dialogflow
    const sessionPath = dfClient.projectAgentSessionPath(projectId, msg.from);
    const [response] = await dfClient.detectIntent({
      session: sessionPath,
      queryInput: { text: { text: msg.body, languageCode: 'es' } }
    });
    const result = response.queryResult;

    // Guarda en Firestore
    await firestore.collection('messages').add({
      from: msg.from,
      text: msg.body,
      intent: result.intent?.displayName || 'Unknown',
      timestamp: new Date()
    });

    // Genera respuesta (Dialogflow o fallback OpenAI)
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
// 6. Servidor HTTP con Express
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
  if (!numero || !mensaje) return res.status(400).json({ error: 'Missing parameters' });
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
