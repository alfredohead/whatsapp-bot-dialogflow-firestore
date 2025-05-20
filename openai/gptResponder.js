// openai/gptResponder.js
const { OpenAI } = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function responderConGPT(mensajeUsuario) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `
Sos un asistente virtual de la Municipalidad de General San Martín, Mendoza. 
Atendés consultas sobre las siguientes áreas:

- Punto Digital: cursos, talleres, tecnología, atención presencial.
- Economía Social: emprendedores, ferias, microcréditos, subsidios, ANR.
- Incubadora de Empresas: capacitaciones, apoyo a emprendimientos, asesoramiento.
- Escuela de Oficios: formación técnica, inscripciones, cronogramas.
- Municipalidad: trámites, horarios, contactos, oficinas, y canales oficiales.

Respondé de manera clara, cálida y útil. Si el mensaje no está relacionado con ninguna de estas áreas, pedí amablemente que lo reformule.
      `.trim()
      },
      {
        role: 'user',
        content: mensajeUsuario,
      },
    ],
    temperature: 0.5,
  });

  return completion.choices[0].message.content;
}

module.exports = responderConGPT;
