import 'dotenv/config';
import axios from 'axios';
import qrcode from 'qrcode';
import http from 'http';
import express from 'express';
import { Client, LocalAuth } from 'whatsapp-web.js';
import { Server as SocketIOServer } from 'socket.io';
import { OpenAI } from 'openai';

// Importar servicios
import dialogflowService from './services/dialogflow.js';
import firestoreService from './services/firestore.js';

// 🚀 Variables de entorno
const APPS_SCRIPT_WEBHOOK_URL = process.env.APPS_SCRIPT_WEBHOOK_URL;
const APPS_SCRIPT_WEBHOOK_SECRET = process.env.APPS_SCRIPT_WEBHOOK_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Configuración de OpenAI para fallback
let openai;
try {
  if (OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    console.log('✅ [OpenAI] API configurada correctamente');
  } else {
    console.warn('⚠️ [OpenAI] API no configurada. El fallback a GPT no estará disponible.');
  }
} catch (error) {
  console.error('❌ [OpenAI] Error al configurar API:', error);
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

// 🔌 Inicializar Express + HTTP + Socket.IO
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server);

// Middleware para JSON
app.use(express.json());

// 🌐 Estado de la sesión
let isClientReady = false;

// 📲 Configurar cliente WhatsApp con Puppeteer mejorado
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './session' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ],
    defaultViewport: null,
    timeout: 60000 // 60 segundos
  }
});

// 🏠 Ruta raíz: página QR y estado
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>WhatsApp QR</title>
  <style>
    body { display:flex; flex-direction:column; align-items:center; font-family:sans-serif; margin-top:50px; }
    #qr img { width:300px; }
    button { margin-top:10px; padding:8px 12px; font-size:16px; }
  </style>
</head>
<body>
  <h1>📲 Escanea el QR con WhatsApp Web</h1>
  <div id="qr">⏳ Esperando QR...</div>
  <p id="status">Estado: inicializando...</p>
  <button onclick="location.reload()">🔄 Refrescar página</button>
  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io();
    socket.on('qr', qr => {
      document.getElementById('qr').innerHTML = '<img src="' + qr + '" />';
      document.getElementById('status').innerText = '📥 QR recibido';
    });
    socket.on('ready', () => document.getElementById('status').innerText = '✅ Conectado');
    socket.on('authenticated', () => document.getElementById('status').innerText = '🔐 Autenticado');
    socket.on('auth_failure', msg => document.getElementById('status').innerText = '🚨 Auth failure: ' + msg);
    socket.on('disconnected', reason => document.getElementById('status').innerText = '🔌 Desconectado: ' + reason);
  </script>
</body>
</html>`);
});

// 📡 Estado de conexión
app.get('/status', (req, res) => res.json({ connected: isClientReady }));

// 🔌 Socket.IO
io.on('connection', () => console.log('🔌 Frontend conectado'));

// 🌟 Eventos de cliente WhatsApp
client.on('qr', async qr => {
  console.log('📸 QR recibido');
  const url = await qrcode.toDataURL(qr).catch(err => { console.error('❌ QR error:', err); });
  io.emit('qr', url);
});

client.on('ready', () => {
  isClientReady = true;
  console.log('✅ Cliente listo');
  io.emit('ready');
});

client.on('authenticated', () => {
  console.log('🔐 Autenticado');
  io.emit('authenticated');
});

client.on('auth_failure', msg => {
  isClientReady = false;
  console.error('🚨 Auth failure:', msg);
  io.emit('auth_failure', msg);
  // Reinicializar después de fallo
  setTimeout(() => initializeClient(), 10000);
});

client.on('disconnected', reason => {
  isClientReady = false;
  console.warn('🔌 Desconectado:', reason);
  io.emit('disconnected', reason);
  setTimeout(() => initializeClient(), 5000);
});

/**
 * Funciones para manejar transferencia a humano y retorno a bot
 */
async function handleHumanTransfer(msg, userData) {
  if (msg.body.toLowerCase() === 'operador') {
    await firestoreService.updateUserData(msg.from, { ...userData, human: true });
    await msg.reply('Te paso con un operador. Cuando quieras volver a hablar con el bot, escribí "bot".');
    return true;
  }
  return false;
}

async function handleBotReturn(msg, userData) {
  if (msg.body.toLowerCase() === 'bot') {
    await firestoreService.updateUserData(msg.from, { ...userData, human: false });
    await msg.reply('Volviste con el bot 🤖. ¿En qué puedo ayudarte?');
    return true;
  }
  return false;
}

// 📨 Procesamiento de mensajes entrantes
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

// 🚨 Capturar promesas no manejadas
process.on('unhandledRejection', reason => {
  console.error('Unhandled Rejection:', reason);
  setTimeout(() => initializeClient(), 10000);
});

/**
 * Inicializar cliente con reintentos
 */
async function initializeClient() {
  try {
    await client.initialize();
  } catch (err) {
    console.error('❌ Error en initialize():', err);
    setTimeout(() => initializeClient(), 10000);
  }
}

// Arrancar la inicialización
initializeClient();

/**
 * Ping periódico para asegurar contexto vivo
 */
setInterval(async () => {
  if (client?.pupPage) {
    try {
      await client.pupPage.title();
    } catch (err) {
      console.warn('🔄 Contexto muerto, reiniciando cliente');
      initializeClient();
    }
  }
}, 30000);

/**
 * Procesar lote y notificar webhook
 */
async function procesarLoteEnSegundoPlano(mensajes) {
  console.log(`📨 Lote ${mensajes.length}`);
  const results = [];
  for (const { numero, mensaje } of mensajes) {
    try {
      await client.sendMessage(`${numero}@c.us`, mensaje);
      results.push({ numero, estado: 'OK', error: null, timestamp: new Date().toISOString() });
      console.log(`✅ ${numero}`);
    } catch (err) {
      results.push({ numero, estado: 'ERROR', error: err.message, timestamp: new Date().toISOString() });
      console.error(`❌ ${numero}:`, err);
    }
  }
  if (APPS_SCRIPT_WEBHOOK_URL) {
    try {
      await axios.post(APPS_SCRIPT_WEBHOOK_URL, { results }, {
        headers: { 'Content-Type': 'application/json', 'x-webhook-secret': APPS_SCRIPT_WEBHOOK_SECRET },
        timeout: 10000
      });
      console.log('🎉 Webhook ok');
    } catch (e) {
      console.error('🚨 Webhook error:', e);
    }
  }
}

// 🔔 Recepción de lote
app.post('/enviarBatch', express.json(), (req, res) => {
  const mensajes = Array.isArray(req.body.mensajes) ? req.body.mensajes : [];
  console.log(`🔔 /enviarBatch ${mensajes.length}`);
  procesarLoteEnSegundoPlano(mensajes);
  res.status(202).send({ status: 'Iniciado' });
});

// Limpieza periódica de historiales inactivos
setInterval(() => {
  const ahora = Date.now();
  for (const [userId, history] of chatHistories.entries()) {
    if (!history.lastAccess || (ahora - history.lastAccess) > 3600000) { // 1 hora
      chatHistories.delete(userId);
      console.log(`🧹 Limpiando historial inactivo de ${userId}`);
    }
  }
}, 1800000); // Cada 30 minutos

// 🏁 Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor escuchando en puerto ${PORT}`));
