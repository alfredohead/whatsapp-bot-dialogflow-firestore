const dialogflow = require('@google-cloud/dialogflow');
const uuid = require('uuid');

const credentials = JSON.parse(Buffer.from(process.env.DIALOGFLOW_JSON, 'base64').toString('utf-8'));
const sessionClient = new dialogflow.SessionsClient({ credentials });

async function getReplyFromDialogflow(message, userId, context = {}) {
  try {
    const sessionPath = sessionClient.projectAgentSessionPath(credentials.project_id, userId || uuid.v4());

    const request = {
      session: sessionPath,
      queryInput: {
        text: { text: message, languageCode: 'es' },
      },
      queryParams: {
        contexts: context?.dialogflowContexts || [],
      },
    };

    const responses = await sessionClient.detectIntent(request);
    return responses[0]?.queryResult?.fulfillmentText;
  } catch (error) {
    console.error('Error en Dialogflow:', error);
    return 'Ocurrió un error al procesar tu mensaje.';
  }
}

module.exports = { getReplyFromDialogflow };
