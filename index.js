// index.js con inicialización segura del proyecto Firestore (sin projectId manual)
const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const dialogflow = require('@google-cloud/dialogflow');
const admin = require('firebase-admin');
const fs = require('fs');

// Credenciales y cliente de Dialogflow
const credentials = JSON.parse(fs.readFileSync('dialogflow-key.json', 'utf8'));
const sessionClient = new dialogflow.SessionsClient({ credentials });
const projectId = credentials.project_id;

// Inicializar Firebase Admin SDK (forma compatible con Firestore)
admin.initializeApp({
  credential: admin.credential.cert({
    clientEmail: credentials.client_email,
    privateKey: credentials.private_key,
    projectId: credentials.project_id
  })
});

const db = admin.firestore();
const sesionesRef = db.collection('sesiones');

// Verificar conexión segura a Firestore al inicio creando un doc temporal
(async () => {
  try {
    await sesionesRef.doc('verificacion_test').set({ check: true });
    await sesionesRef.doc('verificacion_test').delete();
    console.log('✅ Firestore conectado correctamente');
  } catch (error) {
    console.error('❌ ERROR: No se pudo conectar a Firestore. ¿Ya creaste la base y configuraste permisos?');
    console.error(error.message);
    process.exit(1);
  }
})();

// Inicializar WhatsApp Web
const client = new Client();

client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ Asistente de WhatsApp listo');
});

// Utilidades de sesión Firestore
async function obtenerSesion(numero) {
  const doc = await sesionesRef.doc(numero).get();
  return doc.exists ? doc.data() : { modo: 'bot' };
}

async function guardarSesion(numero, datos) {
  await sesionesRef.doc(numero).set(datos);
}

// Manejo de mensajes
client.on('message', async (message) => {
  const numero = message.from;
  const texto = message.body.toLowerCase().trim();

  const frases_humano = [
    "quiero hablar con alguien", "necesito atención humana",
    "puede atenderme una persona", "derivame", "atención humana", "quiero un operador"
  ];

  const sesion = await obtenerSesion(numero);

  if (frases_humano.some(f => texto.includes(f))) {
    await guardarSesion(numero, { modo: 'humano' });
    return message.reply(
      "🧑‍💼 Te estamos derivando a un agente humano. Podés escribir tu consulta aquí.\n" +
      "Si querés volver al asistente virtual, escribí *bot*."
    );
  }

  if (sesion.modo === 'humano') {
    if (texto === 'bot') {
      await guardarSesion(numero, { modo: 'bot' });
      return message.reply("✅ Has vuelto al asistente virtual. ¿En qué puedo ayudarte?");
    } else {
      return; // silencio mientras está en modo humano
    }
  }

  // Procesar con Dialogflow
  const sessionPath = `projects/${projectId}/agent/sessions/${numero}`;
  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        text: message.body,
        languageCode: 'es',
      },
    },
  };

  try {
    const responses = await sessionClient.detectIntent(request);
    const result = responses[0].queryResult;
    const respuesta = result.fulfillmentText || 'No entendí, ¿puedes repetir?';
    message.reply(respuesta);
  } catch (error) {
    console.error('Error en Dialogflow:', error);
    message.reply('Lo siento, algo falló. Intenta de nuevo.');
  }
});

client.initialize();

