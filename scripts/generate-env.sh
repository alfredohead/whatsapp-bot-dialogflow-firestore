#!/bin/bash

echo "🔐 Generando archivo .env con variables codificadas en base64..."

FIREBASE_B64=$(base64 -i credentials/firebase.json | tr -d '\n')
DIALOGFLOW_B64=$(base64 -i credentials/dialogflow.json | tr -d '\n')

echo "FIREBASE_JSON=$FIREBASE_B64" > .env
echo "DIALOGFLOW_JSON=$DIALOGFLOW_B64" >> .env

echo "✅ Archivo .env generado correctamente con las credenciales codificadas."

