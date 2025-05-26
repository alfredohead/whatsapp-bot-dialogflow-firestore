#!/bin/bash

# 📁 Verifica que el directorio credentials/ exista
mkdir -p credentials

# 🔎 Verifica si existen los archivos firebase.json y dialogflow.json
if [[ ! -f credentials/firebase.json ]]; then
  echo "❌ No se encontró credentials/firebase.json"
  exit 1
fi

if [[ ! -f credentials/dialogflow.json ]]; then
  echo "❌ No se encontró credentials/dialogflow.json"
  exit 1
fi

# 📦 Codifica los archivos en base64
firebase_base64=$(base64 -i credentials/firebase.json | tr -d '\n')
dialogflow_base64=$(base64 -i credentials/dialogflow.json | tr -d '\n')

# 🧾 Escribe .env
cat <<EOF > .env
# 🔐 Variables generadas automáticamente
FIREBASE_JSON=${firebase_base64}
DIALOGFLOW_JSON=${dialogflow_base64}
PORT=8080
EOF

echo "✅ Archivo .env generado correctamente con las credenciales codificadas en base64."

