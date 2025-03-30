const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const dialogflow = require('@google-cloud/dialogflow');
const admin = require('firebase-admin');

const credentials = JSON.parse(process.env.DIALOGFLOW_JSON);
const sessionClient = new dialogflow.SessionsClient({ credentials });
const projectId = credentials.project_id;

admin.initializeApp({
  credential: admin.credential.cert({
    clientEmail: credentials.client_email,
    privateKey: credentials.private_key,
    projectId: credentials.project_id
  })
});

const db = admin.firestore();
const sesionesRef = db.collection('sesiones');

(async () => {
  try {
    await sesionesRef.doc('verificacion_test').set({ check: true });
    await sesionesRef.doc('verificacion_test').delete();
    console.log('✅ Firestore conectado correctamente');
  } catch (error) {
    console.error('❌ ERROR: No se pudo conectar a Firestore.');
    console.error(error.message);
    process.exit(1);
  }
})();

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

let latestQR = '';
client.on('qr', (qr) => {
  latestQR = qr;
  console.log('⚠️ Escaneá el QR abriendo /qr en el navegador');
});
client.on('ready', () => console.log('✅ Asistente de WhatsApp listo'));

async function obtenerSesion(numero) {
  const doc = await sesionesRef.doc(numero).get();
  return doc.exists ? doc.data() : { modo: 'bot' };
}
async function guardarSesion(numero, datos) {
  await sesionesRef.doc(numero).set(datos);
}

client.on('message', async (message) => {
  const numero = message.from;
  const texto = message.body?.toLowerCase().trim();
  if (!texto) return message.reply('No entendí tu mensaje. ¿Podés repetirlo?');

  const frases_humano = [
    "quiero hablar con alguien",
    "necesito atención humana",
    "puede atenderme una persona",
    "derivame",
    "atención humana",
    "quiero un operador"
  ];

  const sesion = await obtenerSesion(numero);
  if (frases_humano.some(f => texto.includes(f))) {
    await guardarSesion(numero, { modo: 'humano' });
    return message.reply(
      "🧑‍💼 Te estamos derivando a un agente humano. Podés escribir tu consulta aquí.
" +
      "Si querés volver al asistente virtual, escribí *bot*."
    );
  }

  if (sesion.modo === 'humano') {
    if (texto === 'bot') {
      await guardarSesion(numero, { modo: 'bot' });
      return message.reply("✅ Has vuelto al asistente virtual. ¿En qué puedo ayudarte?");
    } else {
      return;
    }
  }

  const sessionPath = `projects/${projectId}/agent/sessions/${numero}`;
  const request = {
    session: sessionPath,
    queryInput: {
      text: { text: texto, languageCode: 'es' }
    }
  };

  try {
    const responses = await sessionClient.detectIntent(request);
    const result = responses[0].queryResult;
    const contextos = result.outputContexts.map(c => c.name.split('/').pop());
    const area = result.parameters?.fields?.area?.stringValue || '';
    let respuesta = result.fulfillmentText;

    if (contextos.includes("consulta_programas-followup")) {
      if (area.toLowerCase().includes("punto")) {
        respuesta = "📚 Cursos Punto Digital: https://cursos.sanmartinmza.gob.ar";
      } else if (area.toLowerCase().includes("economía")) {
        respuesta = "🧶 Economía Social: economia.social@sanmartinmza.gob.ar";
      } else if (area.toLowerCase().includes("incubadora")) {
        respuesta = "🚀 Incubadora: elincubador@sanmartinmza.gob.ar";
      }
    }

    await message.reply(respuesta || "No entendí, ¿podés repetir?");
  } catch (error) {
    console.error('Error en Dialogflow:', error);
    message.reply('Lo siento, algo falló. Intenta de nuevo.');
  }
});

client.initialize();

const app = express();
app.get('/', (_req, res) => res.send('Bot activo'));
app.get('/qr', async (_req, res) => {
  if (!latestQR) return res.send('QR no generado aún.');
  try {
    const qrImage = await qrcode.toDataURL(latestQR);
    res.send(`<div style="text-align:center;"><h3>Escaneá el QR</h3><img src="${qrImage}" /></div>`);
  } catch (err) {
    res.send('Error generando QR.');
  }
});
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Servidor Express corriendo en el puerto ${PORT}`));
