require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { OpenAI } = require('openai');
const qrcode = require('qrcode-terminal');
const express = require('express');
const compression = require('compression');
const admin = require('firebase-admin');
const dialogflowService = require('./services/dialogflow');
const firestoreService = require('./services/firestore');
const { handleHumanTransfer, handleBotReturn } = require('./services/commands');

// Inicializar Firebase Admin si no está inicializado
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Cargar documentos de /docs para contexto adicional
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

// Configuración de OpenAI para fallback
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
let openai;
if (OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  console.log('✅ [OpenAI] API configurada correctamente');
} else {
  console.warn('⚠️ [OpenAI] API no configurada. El fallback a GPT no estará disponible.');
}

// Mapa para historiales de chat con GPT
const chatHistories = new Map();

// Mensaje del sistema personalizado para GPT
const SYSTEM_PROMPT = `Eres un asistente virtual de la Municipalidad de San Martín. Atiendes consultas ciudadanas relacionadas con distintas áreas:

- Economía Social y Asociativismo
- Punto Digital
- Incubadora de Empresas
- Escuela de Oficios Manuel Belgrano
- Programas Nacionales
- Trámites y contacto general con el municipio

Responde en español con un lenguaje claro, humano y accesible. Usa emojis ocasionalmente para hacer la conversación más amigable.`;

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

  try {
    // Obtener datos del usuario desde Firestore
    const userData = await firestoreService.getUserData(userId);
    
    // Verificar comandos de transferencia a humano/bot
    if (await handleHumanTransfer(msg, userData)) return;
    if (await handleBotReturn(msg, userData)) return;
    if (userData.human) return; // Si está en modo humano, no procesar
    
    // Contador de intentos fallidos
    const failedAttempts = userData.failedAttempts || 0;
    
    // Primero intentar con Dialogflow
    try {
      const { replyText, contextData } = await dialogflowService.sendTextToDialogflow(userId, incoming, userData);
      
      // Si Dialogflow devuelve una respuesta válida (no es un fallback)
      if (replyText && !replyText.includes('No entendí eso') && !replyText.includes('no estoy seguro')) {
        // Resetear contador de intentos fallidos si hubo éxito
        if (failedAttempts > 0) {
          await firestoreService.updateUserData(userId, { 
            ...userData, 
            failedAttempts: 0 
          });
        }
        
        await msg.reply(replyText);
        console.log(`📤 [Respuesta Dialogflow] ${userId}: ${replyText}`);
        return;
      }
      
      // Si llegamos aquí, Dialogflow no entendió la consulta
      console.log(`⚠️ [Dialogflow] No entendió la consulta: ${incoming}`);
      
      // Incrementar contador de intentos fallidos
      const newFailedAttempts = failedAttempts + 1;
      await firestoreService.updateUserData(userId, { 
        ...userData, 
        failedAttempts: newFailedAttempts 
      });
      
      // Si hay demasiados intentos fallidos, sugerir hablar con un humano
      if (newFailedAttempts >= 3) {
        await msg.reply('Parece que estoy teniendo dificultades para entender tu consulta. ¿Te gustaría hablar con un operador humano? Escribe "operador" para ser derivado.');
        return;
      }
      
      // Intentar con GPT como fallback
      if (openai) {
        // Preparar historial de chat para GPT
        let history = chatHistories.get(userId) || [];
        if (history.length === 0) {
          history.push({ role: 'system', content: SYSTEM_PROMPT });
        }
        
        // Buscar documentos relevantes para enriquecer el contexto
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
        
        // Añadir el mensaje del usuario
        history.push({ role: 'user', content: incoming });
        
        // Llamar a la API de OpenAI
        const response = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: history,
        });
        
        const reply = response.choices[0]?.message?.content?.trim() || 
                     'Disculpa, no pude procesar tu consulta.';
        
        // Guardar respuesta en el historial
        history.push({ role: 'assistant', content: reply });
        
        // Limitar el tamaño del historial
        if (history.length > 12) {
          history = [history[0], ...history.slice(-11)];
        }
        chatHistories.set(userId, history);
        
        await msg.reply(reply);
        console.log(`📤 [Respuesta GPT] ${userId}: ${reply}`);
      } else {
        // Si no hay OpenAI configurado, usar respuesta de fallback de Dialogflow
        await msg.reply(replyText || 'No pude entender tu consulta. ¿Podrías reformularla?');
      }
    } catch (dialogflowError) {
      console.error('❌ [Error Dialogflow]', dialogflowError);
      
      // Si falla Dialogflow y tenemos OpenAI, intentar con GPT
      if (openai) {
        let history = chatHistories.get(userId) || [];
        if (history.length === 0) {
          history.push({ role: 'system', content: SYSTEM_PROMPT });
        }
        
        history.push({ role: 'user', content: incoming });
        
        const response = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: history,
        });
        
        const reply = response.choices[0]?.message?.content?.trim() || 
                     'Disculpa, estamos experimentando dificultades técnicas.';
        
        history.push({ role: 'assistant', content: reply });
        
        if (history.length > 12) {
          history = [history[0], ...history.slice(-11)];
        }
        chatHistories.set(userId, history);
        
        await msg.reply(reply);
        console.log(`📤 [Respuesta GPT (fallback)] ${userId}: ${reply}`);
      } else {
        // Si no hay OpenAI, enviar mensaje de error genérico
        await msg.reply('Lo siento, estamos experimentando dificultades técnicas. Por favor, intenta más tarde o escribe "operador" para hablar con una persona.');
      }
    }
  } catch (error) {
    console.error('❌ [Error General]', error);
    await msg.reply('Lo siento, ocurrió un error. Por favor, intenta más tarde o escribe "operador" para hablar con una persona.');
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
