import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import whatsappPkg from 'whatsapp-web.js';
import OpenAI from 'openai';
import qrcode from 'qrcode-terminal';
import express from 'express';
import compression from 'compression';
import admin from 'firebase-admin';
import dialogflowService from './services/dialogflow.js';
import firestoreService from './services/firestore.js';
import { handleHumanTransfer, handleBotReturn } from './services/commands.js';

const { Client, LocalAuth } = whatsappPkg;

// Cargar documentos de /docs
const docsDir = path.resolve('./docs');
const areaDocs = {};
if (fs.existsSync(docsDir)) {
  fs.readdirSync(docsDir).forEach(file => {
    const key = path.parse(file).name;
    const fullPath = path.join(docsDir, file);
    let content;
    if (file.endsWith('.json')) {
      content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } else {
      content = fs.readFileSync(fullPath, 'utf8');
    }
    areaDocs[key] = content;
  });
}

// Configuración de OpenAI
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('❌ [Error] La variable OPENAI_API_KEY no está configurada.');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Mapa para historiales de chat
const chatHistories = new Map();

// Mensaje del sistema personalizado
const SYSTEM_PROMPT = `Sos un asistente virtual de la Municipalidad de General San Martín, Mendoza. Atendés consultas ciudadanas relacionadas con distintas áreas:

- Economía Social y Asociativismo
- Punto Digital
- Incubadora de Empresas
- Escuela de Oficios Manuel Belgrano
- Programas Nacionales
- Trámites y contacto general con el municipio

Respondés en español con un lenguaje claro, humano y accesible.`;

// Configuración del cliente WhatsApp
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './whatsapp-sessions'
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  }
});

// Eventos de WhatsApp
client.on('qr', qr => {
  console.log('🔧 [Setup] Generando código QR...');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ [WhatsApp] Cliente listo y conectado');
});

client.on('message', async msg => {
  const userId = msg.from;
  const incoming = msg.body;
  console.log(`📥 [Mensaje] ${userId}: ${incoming}`);

  // Verificar si el usuario está en modo humano
  const userData = await firestoreService.getUserData(userId);
  if (await handleHumanTransfer(msg, userData)) return;
  if (await handleBotReturn(msg, userData)) return;
  if (userData.human) return;

  try {
    let history = chatHistories.get(userId) || [];
    if (history.length === 0) {
      history.push({ role: 'system', content: SYSTEM_PROMPT });
    }

    // Buscar documentos relevantes
    const lower = incoming.toLowerCase();
    for (const key of Object.keys(areaDocs)) {
      if (lower.includes(key.replace('_', ' '))) {
        const docContent = areaDocs[key];
        history.push({ 
          role: 'system', 
          content: `Referencia ${key}:\n${typeof docContent === 'string' ? docContent : JSON.stringify(docContent)}`
        });
        break;
      }
    }

    history.push({ role: 'user', content: incoming });

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: history,
    });

    const reply = response.choices[0]?.message?.content?.trim() || 
                 'Disculpe, no pude procesar su consulta.';

    history.push({ role: 'assistant', content: reply });

    if (history.length > 12) {
      history = [history[0], ...history.slice(-11)];
    }
    chatHistories.set(userId, history);

    await msg.reply(reply);
    console.log(`📤 [Respuesta] ${userId}: ${reply}`);
  } catch (error) {
    console.error('❌ [Error]', error);
    await msg.reply('Lo siento, ocurrió un error. Por favor, intente más tarde.');
  }
});

// Configuración del servidor Express
const app = express();
app.use(compression());
app.use(express.json());

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

app.get('/health', (_, res) => res.send('OK'));

// Inicializar cliente y servidor
client.initialize();
app.listen(PORT, HOST, () => {
  console.log(`🚀 [Servidor] Escuchando en ${HOST}:${PORT}`);
});
