/ Bypass Dialogflow - Versión simplificada que solo usa WhatsApp y OpenAI
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import qrcode from 'qrcode-terminal';
import OpenAI from 'openai';
import whatsappWeb from 'whatsapp-web.js';

const { Client, LocalAuth } = whatsappWeb;

console.log(chalk.blue('🔧 [Setup]') + ' Iniciando aplicación en modo bypass (sin Dialogflow)');

// Asegurarse de que el directorio de sesión exista
const sessionDir = '/app/session';
if (!fs.existsSync(sessionDir)) {
  console.log(chalk.blue('🔧 [Setup]') + ' Creando directorio de sesión...');
  fs.mkdirSync(sessionDir, { recursive: true });
}

// OpenAI
if (!process.env.OPENAI_API_KEY) {
  console.error(chalk.red('❌ [Error]'), 'La variable OPENAI_API_KEY no está configurada. El bot no podrá responder.');
  process.exit(1);
}

try {
  console.log(chalk.blue('🔧 [Setup]') + ' Configurando OpenAI...');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log(chalk.green('✅ [Setup]') + ' OpenAI configurado correctamente');

  // WhatsApp
  console.log(chalk.blue('🔧 [Setup]') + ' Configurando cliente de WhatsApp...');
  const whatsappClient = new Client({
    authStrategy: new LocalAuth({
      clientId: 'bot',
      dataPath: '/app/session'
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--disable-gpu'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
    }
  });

  // Handlers WhatsApp
  whatsappClient.on('qr', qr => {
    console.log(chalk.blue('🔍 [QR]') + ' Generating QR code:');
    qrcode.generate(qr, { small: true });
  });
  
  whatsappClient.on('ready', () =>
    console.log(chalk.green('✅ [WhatsApp]') + ' Client ready')
  );
  
  whatsappClient.on('message', async msg => {
    console.log(chalk.yellow('📥 [Message]'), msg.from, '-', msg.body);
    try {
      // Usar directamente OpenAI (bypass Dialogflow)
      let reply;
      try {
        console.log(chalk.blue('🔄 [Process]') + ' Procesando mensaje con OpenAI...');
        const chat = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { 
              role: 'system', 
              content: 'Eres un asistente conversacional útil y amigable. Responde de manera concisa y clara.' 
            },
            { role: 'user', content: msg.body }
          ]
        });
        reply = chat.choices[0].message.content.trim();
        console.log(chalk.green('✅ [OpenAI]') + ' Respuesta generada correctamente');
      } catch (openaiError) {
        console.error(chalk.red('❌ [OpenAI Error]'), openaiError);
        reply = "Lo siento, no puedo procesar tu solicitud en este momento. Por favor, inténtalo de nuevo más tarde.";
      }

      // Guardar mensaje y respuesta en archivo local (ya que no podemos usar Firestore)
      try {
        const logDir = path.join(sessionDir, 'logs');
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        
        const logFile = path.join(logDir, 'messages.log');
        const logEntry = `${new Date().toISOString()} | From: ${msg.from} | Message: ${msg.body} | Reply: ${reply}\n`;
        
        fs.appendFileSync(logFile, logEntry);
        console.log(chalk.blue('📝 [Log]') + ' Mensaje guardado en log local');
      } catch (logError) {
        console.error(chalk.red('❌ [Log Error]'), logError);
        // Continuar aunque falle el log
      }

      // Enviar respuesta
      await whatsappClient.sendMessage(msg.from, reply);
      console.log(chalk.magenta('📤 [Sent]'), reply);
    } catch (err) {
      console.error(chalk.red('❌ [Error]'), err);
      try {
        await whatsappClient.sendMessage(msg.from, "Lo siento, ocurrió un error al procesar tu mensaje. Por favor, inténtalo de nuevo más tarde.");
      } catch (sendError) {
        console.error(chalk.red('❌ [Send Error]'), sendError);
      }
    }
  });

  // Express
  const app = express();
  app.use(compression());
  app.use(cors());
  app.use(express.json());

  app.get('/healthz', (_req, res) => {
    res.send('OK - Bypass Mode');
  });

  app.post('/send', async (req, res) => {
    const { numero, mensaje } = req.body;
    if (!numero || !mensaje)
      return res.status(400).json({ error: 'Missing parameters' });
    try {
      await whatsappClient.sendMessage(`${numero}@c.us`, mensaje);
      res.json({ success: true });
    } catch (e) {
      console.error(chalk.red('❌ [Error]'), e);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  // Endpoint para verificar el estado
  app.get('/status', (_req, res) => {
    res.json({
      status: 'OK',
      mode: 'Bypass Dialogflow',
      whatsapp: 'Connected',
      openai: process.env.OPENAI_API_KEY ? 'Configured' : 'Not Configured'
    });
  });

  const PORT = process.env.PORT || 3000;
  const HOST = '0.0.0.0';
  
  // Inicializa WhatsApp
  console.log(chalk.blue('🔧 [Setup]') + ' Inicializando cliente de WhatsApp...');
  whatsappClient.initialize();
  
  // Inicia el servidor Express
  app.listen(PORT, HOST, () =>
    console.log(chalk.green('🚀 [Server]') + ` Listening on ${HOST}:${PORT} (Bypass Mode)`)
  );
  
} catch (error) {
  console.error(chalk.red('❌ [Fatal Error]'), 'Error al inicializar la aplicación:', error);
  process.exit(1);
}
