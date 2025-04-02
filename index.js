require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const express = require('express');

const { getReplyFromDialogflow } = require('./services/dialogflow');
const { saveUserContext, getUserContext } = require('./services/firestore');

const app = express();
const port = process.env.PORT || 8080;

let currentQR = ''; // QR global

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', qr => {
  currentQR = qr;
  console.log('🔑 QR recibido. Escaneá para iniciar sesión...');
  qrcodeTerminal.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ WhatsApp listo');
});

client.on('message', async message => {
  const userId = message.from;

  if (message.body.toLowerCase() === 'operador') {
    await saveUserContext(userId, { estado: 'derivado' });
    return client.sendMessage(userId, 'Te derivo con un operador. Escribí "bot" para volver.');
  }

  if (message.body.toLowerCase() === 'bot') {
    await saveUserContext(userId, { estado: 'bot' });
    return client.sendMessage(userId, 'Volviste al bot. ¿En qué te puedo ayudar?');
  }

  const context = await getUserContext(userId);
  if (context?.estado === 'derivado') return;

  const reply = await getReplyFromDialogflow(message.body, userId, context);
  if (reply) {
    await client.sendMessage(userId, reply);
  }
});

client.initialize();

// Ruta para ver el QR desde navegador
app.get('/qr', async (req, res) => {
  if (!currentQR) {
    return res.send('QR no disponible todavía.');
  }
  try {
    const qrImage = await qrcode.toDataURL(currentQR);
    res.send(`
      <html>
        <body style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; font-family: sans-serif;">
          <h2>Escaneá este QR para conectar WhatsApp</h2>
          <img src="${qrImage}" />
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Error generando el QR');
  }
});

app.get('/', (_, res) => res.send('Bot corriendo'));

app.listen(port, () => {
  console.log(`🚀 Servidor Express activo en puerto ${port}`);
});


