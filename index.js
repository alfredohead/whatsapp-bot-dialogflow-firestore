const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const admin = require('firebase-admin');
const dialogflowService = require('./services/dialogflow');
const firestoreService = require('./services/firestore');
const { handleHumanTransfer, handleBotReturn } = require('./services/commands');

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { args: ['--no-sandbox'] }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));

client.on('ready', () => {
  console.log('✅ WhatsApp bot is ready!');
});

client.on('message', async msg => {
  const userId = msg.from;
  const userData = await firestoreService.getUserData(userId);

  if (await handleHumanTransfer(msg, userData)) return;
  if (await handleBotReturn(msg, userData)) return;
  if (userData.human) return;

  try {
    const dfResponse = await dialogflowService.sendTextToDialogflow(userId, msg.body, userData);
    await firestoreService.updateUserData(userId, dfResponse.contextData);
    await msg.reply(dfResponse.replyText);
  } catch (err) {
    console.error('❌ Error handling message:', err);
    await msg.reply('Ocurrió un error procesando tu mensaje. Intentalo más tarde.');
  }
});

client.initialize();