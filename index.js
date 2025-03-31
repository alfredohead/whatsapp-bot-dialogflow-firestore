const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const { SessionsClient } = require('@google-cloud/dialogflow');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

// Inicializar Firebase
initializeApp({
  credential: applicationDefault()
});

const db = getFirestore();

// Inicializar Dialogflow
const dialogflowClient = new SessionsClient({
  projectId: 'asistentedependencia-mwqx'
});

// Mapa para controlar si un usuario está con humano o bot
const userStates = {};

const client = new Client({
  authStrategy: new LocalAuth()
});

client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ Cliente de WhatsApp listo');
});

client.on('message', async (message) => {
  const userId = message.from;
  const text = message.body.toLowerCase().trim();

  // Volver al bot si el usuario escribe 'bot'
  if (text === 'bot') {
    userStates[userId] = 'bot';
    return await message.reply('🤖 Has vuelto al bot. ¿En qué puedo ayudarte?');
  }

  // Si el usuario está con un humano, ignorar mensajes
  if (userStates[userId] === 'human') return;

  // Procesar mensaje con Dialogflow
  const sessionPath = dialogflowClient.projectAgentSessionPath(
    'asistentedependencia-mwqx',
    userId
  );

  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        text: message.body,
        languageCode: 'es'
      }
    }
  };

  try {
    const responses = await dialogflowClient.detectIntent(request);
    const result = responses[0].queryResult;

    const replyText = result.fulfillmentText;

    // Si se deriva a un humano
    if (replyText.toLowerCase().includes('derivando a un agente humano')) {
      userStates[userId] = 'human';
      await message.reply("🧑‍💼 Te estamos derivando a un agente humano. Podés escribir tu consulta aquí.");
      return;
    }

    await message.reply(replyText);

    // Guardar mensaje en Firestore
    await db.collection('mensajes').add({
      from: userId,
      text: message.body,
      response: replyText,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('Error al procesar el mensaje:', error);
    await message.reply('❌ Ocurrió un error procesando tu mensaje.');
  }
});

// Servidor para Fly.io
const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.send('Bot activo 🚀');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor escuchando en http://0.0.0.0:${PORT}`);
});

client.initialize();
