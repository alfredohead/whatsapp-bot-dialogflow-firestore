const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const { SessionsClient } = require('@google-cloud/dialogflow');
const { Firestore } = require('@google-cloud/firestore');

// Configuración
const projectId = 'asistentedependencia-mwqx';
const sessionClient = new SessionsClient({
  credentials: JSON.parse(process.env.DIALOGFLOW_JSON)
});
const firestore = new Firestore();

const app = express();
const PORT = process.env.PORT || 8080;

// WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ Bot de WhatsApp listo');
});

// Estados de usuarios
const userStates = new Map(); // phone => 'bot' | 'human'

client.on('message', async message => {
  const userId = message.from;

  // Si usuario pide volver al bot
  if (message.body.toLowerCase() === 'bot') {
    userStates.set(userId, 'bot');
    return await message.reply('🤖 ¡Has vuelto a hablar con el bot!');
  }

  const currentState = userStates.get(userId) || 'bot';

  if (currentState === 'human') {
    return; // No responder si está con humano
  }

  // Detectar si debe derivar a humano
  const triggerWords = ['humano', 'persona', 'asesor', 'agente'];
  const shouldDerive = triggerWords.some(word =>
    message.body.toLowerCase().includes(word)
  );

  if (shouldDerive) {
    userStates.set(userId, 'human');
    return await message.reply(
      '🧑‍💼 Te estamos derivando a un agente humano. Podés escribir tu consulta aquí. Escribí *bot* para volver a hablar conmigo.'
    );
  }

  // Enviar mensaje a Dialogflow
  const sessionPath = sessionClient.projectAgentSessionPath(projectId, userId);

  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        text: message.body,
        languageCode: 'es',
      }
    }
  };

  try {
    const responses = await sessionClient.detectIntent(request);
    const result = responses[0].queryResult;
    const reply = result.fulfillmentText;

    await message.reply(reply || 'Lo siento, no entendí eso.');
  } catch (err) {
    console.error('Error con Dialogflow:', err);
    await message.reply('⚠️ Ocurrió un error al procesar tu mensaje.');
  }
});

// Iniciar WhatsApp y servidor
client.initialize();

app.get('/', (req, res) => {
  res.send('🟢 Bot de WhatsApp corriendo en Fly.io');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor Express escuchando en http://0.0.0.0:${PORT}`);
});

