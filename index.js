// index.js completo y listo para producción en Fly.io
require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const dialogflow = require('@google-cloud/dialogflow');
const admin = require('firebase-admin');

// Debug inicial
console.log('🟡 Iniciando cliente de WhatsApp...');

// Cargar credenciales Dialogflow desde .env
const credentials = JSON.parse(process.env.DIALOGFLOW_JSON);
const sessionClient = new dialogflow.SessionsClient({ credentials });
const projectId = credentials.project_id;

// Inicializar Firestore
admin.initializeApp({
  credential: admin.credential.cert({
    clientEmail: credentials.client_email,
    privateKey: credentials.private_key,
    projectId: credentials.project_id
  })
});
const db = admin.firestore();
const sesionesRef = db.collection('sesiones');

// Inicializar cliente de WhatsApp
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

let latestQR = '';

client.on('qr', async (qr) => {
  latestQR = qr;
  console.log('⚠️ Escaneá el QR accediendo a /qr');
});

client.on('ready', () => {
  console.log('✅ Bot de WhatsApp conectado correctamente.');
});

client.on('auth_failure', msg => {
  console.error('❌ Error de autenticación:', msg);
});

client.on('disconnected', reason => {
  console.warn('🔌 Cliente desconectado:', reason);
});

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
  if (!texto) return;

  const sesion = await obtenerSesion(numero);

  const frases_humano = ["quiero hablar con alguien", "atención humana", "operador", "derivame"];
  if (frases_humano.some(f => texto.includes(f))) {
    await guardarSesion(numero, { modo: 'humano' });
    return message.reply("🧑‍💼 Te derivamos a un operador humano. Escribí *bot* para volver al asistente.");
  }

  if (sesion.modo === 'humano') {
    if (texto === 'bot') {
      await guardarSesion(numero, { modo: 'bot' });
      await message.reply("✅ Has vuelto al asistente virtual.");
      return message.reply("¿Sobre qué área querés consultar: Economía Social, Incubadora o Punto Digital?");
    }
    return;
  }

  if (["sí", "si", "claro", "dale", "ok"].includes(texto)) {
    if (sesion.contexto === 'consulta_programas') {
      if (sesion.area === 'incubadora') {
        return message.reply(`🚀 Para postular a la Incubadora de Empresas:
📩 elincubador@sanmartinmza.gob.ar
📞 2634259744
📍 PASIP, Ruta 7 y Carril San Pedro, Palmira`);
      } else if (sesion.area === 'economía social') {
        return message.reply(`🧶 Para Economía Social:
📩 economia.social@sanmartinmza.gob.ar
📞 2634259744
📍 PASIP, Ruta 7 y Carril San Pedro, Palmira`);
      } else if (sesion.area === 'punto digital') {
        return message.reply(`📚 Punto Digital:
👉 https://cursos.sanmartinmza.gob.ar
📩 punto.digital@sanmartinmza.gob.ar
📞 2634259743`);
      }
    }
    return message.reply("¿Podés indicarme a qué área te referís?");
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
    const intent = result.intent.displayName;
    const area = result.parameters?.fields?.area?.stringValue?.toLowerCase() || '';
    const fulfillment = result.fulfillmentText;

    if (intent === 'Consulta_Programas') {
      await guardarSesion(numero, {
        modo: 'bot',
        contexto: 'consulta_programas',
        area
      });
    }

    return message.reply(fulfillment || "No entendí tu consulta, ¿podés reformularla?");
  } catch (err) {
    console.error("❌ Error al procesar con Dialogflow:", err);
    return message.reply("⚠️ Lo siento, hubo un error al procesar tu mensaje.");
  }
});

// Servidor Express para ver el QR desde Fly.io
const app = express();
app.get('/', (_, res) => res.send('Bot activo.'));
app.get('/qr', async (_, res) => {
  if (!latestQR) return res.send('QR aún no generado. Esperá unos segundos...');
  const qrImage = await qrcode.toDataURL(latestQR);
  res.send(`<h3>Escaneá este código para activar el bot:</h3><img src="${qrImage}" />`);
});

// Puerto 8080 para Fly.io
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🟢 Servidor Express activo en puerto ${PORT}`));

// Iniciar WhatsApp
client.initialize().catch(err => {
  console.error('❌ Error al iniciar WhatsApp Web.js:', err);
});
