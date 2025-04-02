const { Client, LocalAuth } = require('whatsapp-web.js');
const { WebhookClient } = require('dialogflow-fulfillment');
const { Firestore } = require('@google-cloud/firestore');
const qrcode = require('qrcode-terminal');
const express = require('express');
const qrcodeWeb = require('qrcode');
require('dotenv').config();

// 🔐 Firebase desde variable de entorno base64
const firebaseBase64 = process.env.FIREBASE_JSON;
if (!firebaseBase64) {
  console.error('❌ FIREBASE_JSON no está definido');
  process.exit(1);
}
const firebaseConfig = JSON.parse(Buffer.from(firebaseBase64, 'base64').toString());
const firestore = new Firestore({ projectId: firebaseConfig.project_id, credentials: firebaseConfig });

// 🤖 WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox'],
  },
});

let currentQR = ''; // Último QR para mostrar por web

client.on('qr', qr => {
  currentQR = qr;
  console.log('🔑 QR recibido. Escaneá para iniciar sesión...');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ Cliente de WhatsApp listo');
});

client.on('message', async msg => {
  const sessionId = msg.from;
  const dfSessionPath = `projects/${firebaseConfig.project_id}/agent/sessions/${sessionId}`;

  const webhookRequest = {
    body: {
      responseId: '',
      queryResult: {
        queryText: msg.body,
        parameters: {},
        allRequiredParamsPresent: true,
        fulfillmentMessages: [],
        outputContexts: [],
        intent: {
          displayName: '',
        },
      },
      session: dfSessionPath,
    },
  };

  const webhookResponse = {
    json: obj => {
      const reply = obj.fulfillmentMessages?.[0]?.text?.text?.[0] || obj.fulfillmentText;
      if (reply) {
        client.sendMessage(msg.from, reply);
      }
    },
  };

  const agent = new WebhookClient({ request: webhookRequest, response: webhookResponse });
  agent.add(`Hola 👋. No entendí eso. ¿Podés reformular?`);
  agent.handleRequest({
    'Default Fallback Intent': () => agent.add('Lo siento, no entendí eso.'),
  });
});

client.initialize();

// 🌐 Servidor web para mostrar el QR
const app = express();

app.get('/qr', async (req, res) => {
  if (!currentQR) {
    return res.send(`
      <html>
        <head>
          <meta http-equiv="refresh" content="30" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: #f4f4f4;
              text-align: center;
              flex-direction: column;
            }
            button {
              margin-top: 20px;
              padding: 10px 20px;
              font-size: 1rem;
              background-color: #007bff;
              color: white;
              border: none;
              border-radius: 8px;
              cursor: pointer;
            }
          </style>
        </head>
        <body>
          <div>
            <h2>🕐 QR no disponible todavía</h2>
            <p>La página se recargará automáticamente cada 30 segundos.</p>
            <button onclick="location.reload()">🔄 Recargar manualmente</button>
          </div>
        </body>
      </html>
    `);
  }

  try {
    const qrImage = await qrcodeWeb.toDataURL(currentQR);
    res.send(`
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: #e7f3ff;
              color: #333;
              text-align: center;
            }
            img {
              width: 90%;
              max-width: 300px;
              margin-top: 20px;
              border: 8px solid #fff;
              border-radius: 16px;
              box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
            }
            h2 {
              margin: 0;
              padding: 0 20px;
              font-size: 1.6rem;
            }
          </style>
        </head>
        <body>
          <h2>Escaneá este código QR para conectar tu WhatsApp</h2>
          <img src="${qrImage}" alt="Código QR" />
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Error generando el QR');
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Servidor Express activo en puerto ${PORT}`);
});
