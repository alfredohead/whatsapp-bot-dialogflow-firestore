
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const dialogflow = require('@google-cloud/dialogflow');
const uuid = require('uuid');

// Inicializar el cliente de WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let sessions = new Map();
const projectId = process.env.DIALOGFLOW_PROJECT_ID;
const sessionClient = new dialogflow.SessionsClient({
    credentials: JSON.parse(process.env.DIALOGFLOW_JSON)
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('🤖 Bot is ready!');
});

client.on('message', async (message) => {
    const chat = await message.getChat();
    const userId = message.from;

    if (!sessions.has(userId)) {
        sessions.set(userId, {
            sessionId: uuid.v4(),
            human: false
        });
    }

    const session = sessions.get(userId);

    if (message.body.toLowerCase() === 'bot') {
        session.human = false;
        await message.reply('🤖 Has vuelto a hablar con el bot.');
        return;
    }

    if (session.human) {
        return;
    }

    if (message.body.toLowerCase().includes('operador') || message.body.toLowerCase().includes('humano')) {
        session.human = true;
        await message.reply("🧑‍💼 Te estamos derivando a un agente humano. Podés escribir tu consulta aquí.");
        return;
    }

    try {
        const sessionPath = sessionClient.projectAgentSessionPath(projectId, session.sessionId);

        const request = {
            session: sessionPath,
            queryInput: {
                text: {
                    text: message.body,
                    languageCode: 'es',
                },
            },
        };

        const responses = await sessionClient.detectIntent(request);
        const result = responses[0].queryResult;

        await message.reply(result.fulfillmentText);
    } catch (err) {
        console.error('Dialogflow error:', err);
        await message.reply('⚠️ Ocurrió un error al procesar tu mensaje.');
    }
});

client.initialize();
