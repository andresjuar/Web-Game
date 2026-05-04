// Carga las variables de entorno del archivo .env
require('dotenv').config();

const aiService = require('./aiService');

async function testAI() {
  console.log("🚀 Iniciando prueba de Gemini...\n");

  try {
    // 1. Probar Generación de Trivia
    console.log("--- Probando: generateTriviaQuestions ---");
    const trivia = await aiService.generateTriviaQuestions("Valorant smash or pass", 3);
    console.log("✅ Trivia generada con éxito:");
    console.log(trivia); // Muestra los datos en una tabla bonita en la consola


  } catch (error) {
    console.error("❌ Error durante la prueba:");
    console.error(error.message);
  }
}

testAI();