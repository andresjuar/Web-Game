/**
 * aiService.js
 * Handles all communication with the Google Gemini API.
 * Used to generate trivia questions for AI Trivia mode.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");

// Inicializamos el SDK con la llave de API de Google
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Configuramos el modelo (Gemini 1.5 Flash es ideal para velocidad y costo en trivias)
const model = genAI.getGenerativeModel({ 
  model: "gemini-2.5-flash",
  generationConfig: {
    responseMimeType: "application/json", // Forzamos respuesta JSON nativa
  }
});

/**
 * Generates trivia questions for a given topic.
 */
async function generateTriviaQuestions(topic, count = 8) {
  // Añadimos una instrucción más explícita
  const prompt = `Generate a JSON array of ${count} trivia questions about ${topic}. 
  Format: [{"question": "...", "options": ["...", "...", "...", "..."], "correct": 0}]`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();
    
    // Limpieza de seguridad por si acaso Gemini ignora el mimeType
    text = text.replace(/```json|```/gi, "").trim();
    
    return JSON.parse(text);
  } catch (error) {
    console.error("Error detallado:", error);
    throw error;
  }
}
/**
 * Generates Liar Game prompts.
 */
async function generateLiarPrompts(count = 5) {
  const prompt = `You are a party game host. Generate exactly ${count} fun, personal, open-ended prompts for a social deduction game called "Liar Game".

Rules:
- Prompts should be fun and suitable for groups of friends.
- They should have answers unique enough that a liar can be detected.
- Avoid sensitive topics.

Return a JSON array of strings. Example:
["Name a movie that made you cry", "What is your most useless skill?"]`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const rawText = response.text();

  const prompts = JSON.parse(rawText);

  if (!Array.isArray(prompts) || prompts.some((p) => typeof p !== "string")) {
    throw new Error("Gemini did not return a valid array of strings");
  }

  return prompts;
}

module.exports = { generateTriviaQuestions, generateLiarPrompts };