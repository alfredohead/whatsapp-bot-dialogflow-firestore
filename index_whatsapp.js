
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Configuración de Firebase
let firebaseCredentials;
if (fs.existsSync('./credentials/firebase.json')) {
  firebaseCredentials = require('./credentials/firebase.json');
} else {
  console.error('❌ No se encontró credentials/firebase.json');
  process.exit(1);
}

initializeApp({ credential: cert(firebaseCredentials) });
const db = getFirestore();

// Cliente de WhatsApp
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true }
});

client.on('qr', (qr) => {
  console.log('🔐 Escaneá el siguiente QR:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ Cliente WhatsApp listo');
});

client.on('message', async msg => {
  const numero = msg.from.replace('@c.us', '');
  const texto = msg.body.toLowerCase();

  // Cambiar a modo humano
  if (texto === 'operador') {
    await db.collection('usuarios').doc(numero).set({ modo: 'humano' }, { merge: true });
    msg.reply('🙋‍♂️ El bot fue desactivado. Estás hablando con un operador.');
    return;
  }

  // Volver a modo bot
  if (texto === 'bot') {
    await db.collection('usuarios').doc(numero).set({ modo: 'bot' }, { merge: true });
    msg.reply('🤖 Bot activado. ¿En qué puedo ayudarte?');
    return;
  }

  // Responder solo si está en modo bot
  const doc = await db.collection('usuarios').doc(numero).get();
  const modo = doc.exists && doc.data().modo === 'humano' ? 'humano' : 'bot';
  if (modo === 'humano') return;

  // Aquí iría la lógica con Dialogflow...
  msg.reply('🤖 Esta es una respuesta simulada del bot.');
});

// Servidor Express
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

// Endpoint de prueba
app.get('/', (req, res) => {
  res.send('🤖 Bot de WhatsApp operativo');
});

// 🔁 Endpoint para responder desde el operador
const API_KEY = process.env.API_KEY || '123456';

app.post('/responder', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || authHeader !== `Bearer ${API_KEY}`) {
    return res.status(403).send('No autorizado');
  }

  const { numero, mensaje } = req.body;
  if (!numero || !mensaje) {
    return res.status(400).send('Faltan campos: numero o mensaje');
  }

  try {
    await client.sendMessage(`${numero}@c.us`, mensaje);
    console.log(`📤 Mensaje enviado a ${numero}: ${mensaje}`);
    res.send('Mensaje enviado con éxito');
  } catch (error) {
    console.error(`❌ Error al enviar mensaje a ${numero}`, error);
    res.status(500).send('Error al enviar mensaje');
  }
});

// Iniciar todo
client.initialize();
app.listen(PORT, () => {
  console.log(`🌐 Servidor escuchando en puerto ${PORT}`);
});
