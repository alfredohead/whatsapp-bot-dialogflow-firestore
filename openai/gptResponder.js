const { OpenAI } = require('openai');
const fs = require('fs');
require('dotenv').config();

// Inicializar cliente de OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Mapa para almacenar el historial de conversaciones por usuario
const conversationHistories = new Map();
// Mapa para almacenar contador de intentos fallidos por usuario
const failedAttemptsCounter = new Map();
// Número máximo de intentos fallidos antes de sugerir operador
const MAX_FAILED_ATTEMPTS = 3;

/**
 * Responde a un mensaje utilizando el asistente GPT
 * @param {string} message - Mensaje del usuario
 * @param {string} userId - ID del usuario
 * @param {Object} dialogflowData - Datos relevantes de Dialogflow
 * @returns {Promise<string>} - Respuesta del asistente
 */
async function responderConGPT(message, userId, dialogflowData = {}) {
  try {
    // Inicializar historial si no existe para este usuario
    if (!conversationHistories.has(userId)) {
      conversationHistories.set(userId, []);
    }
    
    // Obtener historial de conversación
    const conversationHistory = conversationHistories.get(userId);
    
    // Preparar contexto con información de Dialogflow si está disponible
    let systemMessage = "Eres un asistente virtual de la Municipalidad de San Martín que ayuda a los ciudadanos con información sobre servicios municipales.";
    
    if (dialogflowData.intent) {
      systemMessage += ` El usuario está consultando sobre: ${dialogflowData.intent}.`;
    }
    
    if (dialogflowData.parameters && Object.keys(dialogflowData.parameters).length > 0) {
      systemMessage += ` Parámetros detectados: ${JSON.stringify(dialogflowData.parameters)}.`;
    }
    
    // Construir mensajes para la API
    const messages = [
      { role: 'system', content: systemMessage },
      ...conversationHistory,
      { role: 'user', content: message }
    ];
    
    // Llamar a la API de OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo", // Usar el modelo más adecuado
      messages: messages,
      temperature: 0.7,
      max_tokens: 500,
    });
    
    // Obtener respuesta
    const response = completion.choices[0].message.content;
    
    // Guardar la interacción en el historial
    conversationHistory.push({ role: 'user', content: message });
    conversationHistory.push({ role: 'assistant', content: response });
    
    // Limitar el tamaño del historial (mantener últimas 10 interacciones = 20 mensajes)
    if (conversationHistory.length > 20) {
      conversationHistory.splice(0, 2); // Eliminar la interacción más antigua
    }
    
    // Resetear contador de intentos fallidos si la respuesta es exitosa
    failedAttemptsCounter.set(userId, 0);
    
    return response;
    
  } catch (error) {
    console.error('Error al llamar a la API de OpenAI:', error);
    
    // Incrementar contador de intentos fallidos
    const failedAttempts = (failedAttemptsCounter.get(userId) || 0) + 1;
    failedAttemptsCounter.set(userId, failedAttempts);
    
    // Sugerir operador humano después de MAX_FAILED_ATTEMPTS intentos fallidos
    if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
      return '⚠️ Parece que estoy teniendo dificultades para entender tu consulta. ¿Te gustaría hablar con un operador humano? Escribe "operador" para ser derivado.';
    }
    
    return '⚠️ Lo siento, tuve un problema al procesar tu consulta. ¿Podrías reformularla?';
  }
}

/**
 * Función para usar el asistente específico de ChatGPT
 * @param {string} message - Mensaje del usuario
 * @param {string} userId - ID del usuario
 * @param {Object} dialogflowData - Datos relevantes de Dialogflow
 * @returns {Promise<string>} - Respuesta del asistente
 */
async function responderConAsistenteEspecifico(message, userId, dialogflowData = {}) {
  try {
    // Inicializar historial si no existe para este usuario
    if (!conversationHistories.has(userId)) {
      conversationHistories.set(userId, []);
    }
    
    // Obtener historial de conversación
    const conversationHistory = conversationHistories.get(userId);
    
    // ID del asistente específico
    const assistantId = "g-682b9d0a319c81919fc3c444a8b25f3d";
    
    // Crear un thread si no existe para este usuario
    let threadId;
    if (!threadIds.has(userId)) {
      const thread = await openai.beta.threads.create();
      threadIds.set(userId, thread.id);
      threadId = thread.id;
    } else {
      threadId = threadIds.get(userId);
    }
    
    // Añadir mensaje del usuario al thread
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: message,
    });
    
    // Ejecutar el asistente
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });
    
    // Esperar a que termine la ejecución
    let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
    
    while (runStatus.status !== "completed") {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
      
      if (["failed", "cancelled", "expired"].includes(runStatus.status)) {
        throw new Error(`Run ended with status: ${runStatus.status}`);
      }
    }
    
    // Obtener mensajes
    const messages = await openai.beta.threads.messages.list(threadId);
    
    // Obtener la última respuesta del asistente
    const lastMessage = messages.data
      .filter(message => message.role === "assistant")
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    
    if (!lastMessage) {
      throw new Error("No se encontró respuesta del asistente");
    }
    
    const response = lastMessage.content[0].text.value;
    
    // Guardar la interacción en el historial local
    conversationHistory.push({ role: 'user', content: message });
    conversationHistory.push({ role: 'assistant', content: response });
    
    // Limitar el tamaño del historial (mantener últimas 10 interacciones = 20 mensajes)
    if (conversationHistory.length > 20) {
      conversationHistory.splice(0, 2);
    }
    
    // Resetear contador de intentos fallidos
    failedAttemptsCounter.set(userId, 0);
    
    return response;
    
  } catch (error) {
    console.error('Error al usar el asistente específico:', error);
    
    // Incrementar contador de intentos fallidos
    const failedAttempts = (failedAttemptsCounter.get(userId) || 0) + 1;
    failedAttemptsCounter.set(userId, failedAttempts);
    
    // Sugerir operador humano después de MAX_FAILED_ATTEMPTS intentos fallidos
    if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
      return '⚠️ Parece que estoy teniendo dificultades para entender tu consulta. ¿Te gustaría hablar con un operador humano? Escribe "operador" para ser derivado.';
    }
    
    return '⚠️ Lo siento, tuve un problema al procesar tu consulta. ¿Podrías reformularla?';
  }
}

// Mapa para almacenar IDs de threads por usuario (para el asistente específico)
const threadIds = new Map();

// Exportar ambas funciones para permitir flexibilidad
module.exports = responderConGPT;
module.exports.responderConAsistenteEspecifico = responderConAsistenteEspecifico;
