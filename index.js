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

// Initialize Firebase
const firebaseCredentials = process.env.FIREBASE_JSON 
  ? JSON.parse(Buffer.from(process.env.FIREBASE_JSON, 'base64').toString('utf8'))
  : JSON.parse(fs.readFileSync('./serviceAccount.json', 'utf8'));

initializeApp({ credential: cert(firebaseCredentials) });
const firestore = getFirestore();

// Initialize clients
const dfClient = new SessionsClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const whatsappClient = new Client({
  authStrategy: new LocalAuth({
    dataPath: './whatsapp-sessions'
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

// WhatsApp event handlers
whatsappClient.on('qr', qr => {
  console.log(chalk.blue('🔍 [QR]') + ' Generating QR code:');
  qrcode.generate(qr, { small: true });
});

whatsappClient.on('ready', () => console.log(chalk.green('✅ [WhatsApp]') + ' Client ready'));

whatsappClient.on('message', async msg => {
  console.log(chalk.yellow('📥 [Message]'), msg.from, '-', msg.body);
  try {
    // Process with Dialogflow
    const sessionPath = dfClient.projectAgentSessionPath(process.env.GOOGLE_PROJECT_ID, msg.from);
    const dfResponse = await dfClient.detectIntent({
      session: sessionPath,
      queryInput: { text: { text: msg.body, languageCode: 'es' } }
    });
    const queryResult = dfResponse[0].queryResult;

    // Store in Firestore
    await firestore.collection('messages').add({
      from: msg.from,
      text: msg.body,
      intent: queryResult.intent?.displayName || 'Unknown',
      timestamp: new Date()
    });

    // Get response from Dialogflow or OpenAI
    let reply = queryResult.fulfillmentText;
    if (!reply) {
      const chatRes = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: msg.body }
        ]
      });
      reply = chatRes.choices[0].message.content.trim();
    }

    await whatsappClient.sendMessage(msg.from, reply);
    console.log(chalk.magenta('📤 [Sent]'), reply);
  } catch (error) {
    console.error(chalk.red('❌ [Error]'), error);
  }
});

// Express server setup
const app = express();
app.use(compression());
app.use(cors());
app.use(express.json());

// Health check route
app.get('/healthz', (_req, res) => res.send('OK'));

// Dialogflow webhook
app.post('/dialogflow-webhook', (req, res) => {
  const agent = new WebhookClient({ request: req, response: res });
  
  const intentMap = new Map([
    ['Default Welcome Intent', agent => agent.add('¡Hola! ¿En qué puedo ayudarte?')],
    ['Default Fallback Intent', agent => agent.add('Lo siento, no entendí. ¿Podrías reformularlo?')]
  ]);

  agent.handleRequest(intentMap);
});

// Operator message endpoint
app.post('/send', async (req, res) => {
  const { numero, mensaje } = req.body;
  if (!numero || !mensaje) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    await whatsappClient.sendMessage(`${numero}@c.us`, mensaje);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error(chalk.red('❌ [Error]'), err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Initialize WhatsApp client and start server
const PORT = process.env.PORT || 3000;

whatsappClient.initialize();
app.listen(PORT, () => console.log(chalk.green('🚀 [Server]') + ` Listening on port ${PORT}`));