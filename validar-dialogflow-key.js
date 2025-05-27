// validar-dialogflow-key.js
const dialogflow = require('@google-cloud/dialogflow');
const fs = require('fs');

function validarCredenciales(path) {
  try {
    const raw = fs.readFileSync(path);
    const credentials = JSON.parse(raw);

    const sessionClient = new dialogflow.SessionsClient({
      credentials: {
        client_email: credentials.client_email,
        private_key: credentials.private_key,
      },
      projectId: credentials.project_id,
    });

    const sessionPath = sessionClient.projectAgentSessionPath(
      credentials.project_id,
      'verificacion-session'
    );

    const request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: 'Hola',
          languageCode: 'es',
        },
      },
    };

    sessionClient.detectIntent(request)
      .then(responses => {
        const result = responses[0].queryResult;
        console.log('✅ Conexión exitosa a Dialogflow');
        console.log('🧠 Intent detectado:', result.intent.displayName);
        console.log('📩 Respuesta:', result.fulfillmentText);
      })
      .catch(err => {
        console.error('❌ Error al hacer request a Dialogflow:', err.message);
      });

  } catch (err) {
    console.error('❌ Error al leer o parsear el archivo:', err.message);
  }
}

// Reemplazá por la ruta de tu archivo o parámetro desde línea de comandos
validarCredenciales('./credentials/firebase.json');

