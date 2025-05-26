// Bypass Dialogflow - Versión simplificada que solo usa WhatsApp y OpenAI
import 'dotenv/config';

// Módulos CommonJS adaptados a ES Module
debugger;
import fs from 'fs';
import path from 'path';
import whatsappPkg from 'whatsapp-web.js';
const { Client, LocalAuth } = whatsappPkg;

import OpenAI from 'openai';
import qrcode from 'qrcode-terminal';

// Cargar documentos de /docs
const docsDir = path.resolve('./docs');
const areaDocs = {};
if (fs.existsSync(docsDir)) {
  fs.readdirSync(docsDir).forEach(file => {
    const key = path.parse(file).name; // ej: 'punto_digital'
    const fullPath = path.join(docsDir, file);
    let content;
    if (file.endsWith('.json')) {
      content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } else {
      content = fs.readFileSync(fullPath, 'utf8');
    }
    areaDocs[key] = content;
  });
}

// Mapa para guardar el historial de conversaciones por usuario
const chatHistories = new Map();

// Verificar que la API key de OpenAI esté configurada
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('❌ [Error] La variable OPENAI_API_KEY no está configurada. El bot no podrá responder.');
  process.exit(1);
}

// Mensaje del sistema personalizado
const SYSTEM_PROMPT = `Sos un asistente virtual de la Municipalidad de General San Martín, Mendoza. Atendés consultas ciudadanas relacionadas con distintas áreas:

- Economía Social y Asociativismo
- Punto Digital
- Incubadora de Empresas
- Escuela de Oficios Manuel Belgrano
- Programas Nacionales
- Trámites y contacto general con el municipio

Respondés en español con un lenguaje claro, humano y accesible. Tu objetivo es orientar, informar y ayudar al ciudadano. Si la consulta no corresponde a tu ámbito, indicás cómo continuar o derivás a un operador.

Siempre mantenés el contexto de la conversación. Por ejemplo, si el usuario menciona "Punto Digital", y luego dice "¿cómo me inscribo?", debés responder en ese contexto.

También usás los documentos cargados sobre cada área si están disponibles.

Para saludos iniciales, seguí la plantilla definida.

Podés usar como referencia las páginas oficiales y los documentos en /docs.

Si el usuario dice “operador”, informás cómo contactarlo. Si dice “bot”, volvés a activarte.

Usá un tono amable, inclusivo y profesional.`;

// Configuración de OpenAI
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Inicializa cliente de WhatsApp
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './wwebjs_sessions',
    clientId: 'default'
  }),
  puppeteer: { headless: true, args: ['--no-sandbox'] }
});

client.on('qr', qr => {
  console.log('🔧 [Setup] Generando QR para autenticar...');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('🔧 [Setup] Cliente WhatsApp listo y conectado.');
});

client.on('message', async msg => {
  try {
    const userId = msg.from;
    const incoming = msg.body;
    console.log(`📥 [Mensaje] ${userId}: ${incoming}`);

    // Recuperar historial o iniciar uno nuevo
    let history = chatHistories.get(userId) || [];
    if (history.length === 0) {
      history.push({ role: 'system', content: SYSTEM_PROMPT });
    }
    // Incluir referencia de documentos si menciona un área
    const lower = incoming.toLowerCase();
    for (const key of Object.keys(areaDocs)) {
      if (lower.includes(key.replace('_', ' '))) {
        const docContent = areaDocs[key];
        history.push({ role: 'system', content: `Referencia ${key}:
${typeof docContent === 'string' ? docContent : JSON.stringify(docContent)}` });
        break;
      }
    }
    // Agregar mensaje del usuario
    history.push({ role: 'user', content: incoming });

    // Llamar a OpenAI con el historial completo
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: history,
    });

    const reply = response.choices?.[0]?.message?.content?.trim() || 'Lo siento, no pude generar una respuesta.';
    // Agregar respuesta al historial
    history.push({ role: 'assistant', content: reply });

    // Mantener solo los últimos 12 mensajes (incluyendo system)
    if (history.length > 12) {
      history = [history[0], ...history.slice(-11)];
    }
    chatHistories.set(userId, history);

    // Enviar la respuesta por WhatsApp
    await msg.reply(reply);
    console.log(`📤 [Respuesta] ${userId}: ${reply}`);
  } catch (error) {
    console.error('❌ [Error al procesar mensaje]', error);
  }
});

client.initialize();

