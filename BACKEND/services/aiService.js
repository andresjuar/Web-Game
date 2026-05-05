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
    responseMimeType: "application/json", 
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
    //throw error;
  }
  console.log("Using backup questions");
  return JSON.parse(`[
  {
    "question": "Which company developed VALORANT?",
    "options": ["Valve", "Riot Games", "Epic Games", "Blizzard Entertainment"],
    "correct": 1
  },
  {
    "question": "What is the maximum number of players on a VALORANT team?",
    "options": ["4", "5", "6", "7"],
    "correct": 1
  },
  {
    "question": "Which agent is known for using a bow and recon abilities?",
    "options": ["Sova", "Phoenix", "Jett", "Brimstone"],
    "correct": 0
  },
  {
    "question": "What is the name of the spike defusal game mode in VALORANT?",
    "options": ["Demolition", "Search and Destroy", "Unrated", "Spike Rush"],
    "correct": 3
  },
  {
    "question": "Which agent can revive fallen teammates?",
    "options": ["Sage", "Skye", "Killjoy", "Reyna"],
    "correct": 0
  },
  {
    "question": "What currency is used to buy weapons during a match?",
    "options": ["Credits", "Coins", "Gold", "Points"],
    "correct": 0
  },
  {
    "question": "Which map features three bomb sites?",
    "options": ["Bind", "Haven", "Ascent", "Split"],
    "correct": 1
  },
  {
    "question": "Which agent is known for teleportation abilities?",
    "options": ["Omen", "Cypher", "Breach", "Raze"],
    "correct": 0
  }
]`);
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