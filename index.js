import 'dotenv/config';
import express from 'express';
import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';

const { Client, LocalAuth } = pkg;

// Configure WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './whatsapp-sessions'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--single-process',
            '--no-zygote',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-sync',
            '--disable-default-apps',
            '--disable-translate',
            '--disable-features=site-per-process',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-device-discovery-notifications'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome'
    }
});

// Configuración del servidor Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Variables de estado
let isClientReady = false;
let qrCodeData = null;

// Eventos del cliente WhatsApp
client.on('qr', (qr) => {
    console.log('QR Code generado:');
    qrcode.generate(qr, { small: true });
    qrCodeData = qr;
});

client.on('ready', () => {
    console.log('✅ Cliente WhatsApp conectado y listo!');
    isClientReady = true;
    qrCodeData = null;
});

client.on('authenticated', () => {
    console.log('✅ Cliente autenticado correctamente');
});

client.on('auth_failure', (msg) => {
    console.error('❌ Error de autenticación:', msg);
});

client.on('disconnected', (reason) => {
    console.log('❌ Cliente desconectado:', reason);
    isClientReady = false;
});

// Manejo de mensajes recibidos
client.on('message', async (message) => {
    try {
        console.log(`📩 Mensaje recibido de ${message.from}: ${message.body}`);
        
        // Ejemplo de respuesta automática
        if (message.body.toLowerCase().includes('hola')) {
            await message.reply('¡Hola! ¿En qué puedo ayudarte?');
        }
        
        // Agregar más lógica de respuestas aquí
        
    } catch (error) {
        console.error('Error procesando mensaje:', error);
    }
});

// Rutas de la API
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'WhatsApp Bot API funcionando',
        clientReady: isClientReady,
        timestamp: new Date().toISOString()
    });
});

// Endpoint para verificar estado
app.get('/status', (req, res) => {
    res.json({
        ready: isClientReady,
        qrCode: qrCodeData,
        timestamp: new Date().toISOString()
    });
});

// Endpoint para enviar mensajes
app.post('/send-message', async (req, res) => {
    try {
        const { number, message } = req.body;
        
        if (!isClientReady) {
            return res.status(503).json({
                error: 'Cliente WhatsApp no está listo',
                ready: false
            });
        }
        
        if (!number || !message) {
            return res.status(400).json({
                error: 'Número y mensaje son requeridos'
            });
        }
        
        // Formatear número (agregar @c.us si no lo tiene)
        const chatId = number.includes('@') ? number : `${number}@c.us`;
        
        await client.sendMessage(chatId, message);
        
        res.json({
            success: true,
            message: 'Mensaje enviado correctamente',
            to: number,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error enviando mensaje:', error);
        res.status(500).json({
            error: 'Error enviando mensaje',
            details: error.message
        });
    }
});

// Endpoint para obtener QR Code
app.get('/qr', (req, res) => {
    if (qrCodeData) {
        res.json({
            qr: qrCodeData,
            ready: false
        });
    } else if (isClientReady) {
        res.json({
            message: 'Cliente ya está conectado',
            ready: true
        });
    } else {
        res.json({
            message: 'QR Code no disponible',
            ready: false
        });
    }
});

// Health check para Fly.io
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

// Manejo de errores globales
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('🛑 Cerrando aplicación...');
    try {
        await client.destroy();
        process.exit(0);
    } catch (error) {
        console.error('Error cerrando cliente:', error);
        process.exit(1);
    }
});

process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM recibido, cerrando aplicación...');
    try {
        await client.destroy();
        process.exit(0);
    } catch (error) {
        console.error('Error cerrando cliente:', error);
        process.exit(1);
    }
});

// Inicializar cliente WhatsApp
console.log('🚀 Inicializando cliente WhatsApp...');
client.initialize();

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor corriendo en puerto ${PORT}`);
    console.log(`📱 Bot WhatsApp iniciado`);
});