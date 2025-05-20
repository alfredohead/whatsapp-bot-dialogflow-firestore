const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const compression = require('compression');
const cors = require('cors');
const chalk = require('chalk');
const { WebhookClient } = require('dialogflow-fulfillment');
const { SessionsClient } = require('@google-cloud/dialogflow');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { Configuration, OpenAIApi } = require('openai');
require('dotenv').config();

// 🔐 Cargar credenciales de Firebase
let firebaseCredentials;
if (process.env.FIREBASE_JSON) {
  firebaseCredentials = JSON.parse(
    Buffer.from(process.env.FIREBASE_JSON, 'base64').toString('utf8')
  );
} else if (fs.existsSync('./serviceAccount.json')) {
  firebaseCredentials = require('./serviceAccount.json');
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
const openaiConfig = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openai = new OpenAIApi(openaiConfig);

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

// Manejo de mensajes
whatsappClient.on('message', async msg => {
  console.log(chalk.yellow('📥 [Mensaje recibido]'), msg.from, '-', msg.body);
  try {
    // Procesamiento en Dialogflow
    const sessionPath = dfClient.projectAgentSessionPath(projectId, msg.from);
    const dfReq = {
      session: sessionPath,
      queryInput: { text: { text: msg.body, languageCode: 'es' } }
    };
    const dfRes = await dfClient.detectIntent(dfReq);
    const dfResult = dfRes[0].queryResult;
    console.log(chalk.cyan('💾 [Firestore]') + ' Guardando mensaje');
    await firestore.collection('messages').add({
      from: msg.from,
      text: msg.body,
      intent: dfResult.intent.displayName || 'Desconocido',
      timestamp: new Date()
    });

    // Obtener respuesta de Dialogflow o fallback a OpenAI
    let reply = dfResult.fulfillmentText;
    if (!reply) {
      console.log(chalk.magenta('🤖 [OpenAI] Llamada a ChatGPT como fallback'));
      const chatRes = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Eres un asistente conversacional útil.' },
          { role: 'user', content: msg.body }
        ]
      });
      reply = chatRes.data.choices[0].message.content.trim();
    }

    await whatsappClient.sendMessage(msg.from, reply);
    console.log(chalk.magenta('📤 [Respuesta enviada]'), reply);
  } catch (err) {
    console.error(chalk.red('❌ [Error procesando mensaje]'), err);
  }
});
whatsappClient.initialize();

// Express app
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
  function welcome(agent) { agent.add('¡Hola! ¿En qué puedo ayudarte?'); }
  function fallback(agent) { agent.add('Lo siento, no entendí. ¿Podrías reformularlo?'); }
  const intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);
  agent.handleRequest(intentMap);
});

// Endpoint para enviar mensajes desde el panel de operador
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
  } catch (error) {
    console.error(chalk.red('❌ [Error Operador]') + ' No se pudo enviar el mensaje', error);
    res.status(500).json({ error: 'No se pudo enviar el mensaje' });
  }
});

app.listen(PORT, () => console.log(chalk.green('🚀 [Server]') + ` Escuchando en el puerto ${PORT}`));
