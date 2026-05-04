/**
 * aiService.js
 * Handles all communication with the ai selected api, right now is Anthropic Claude API.
 * Used to generate trivia questions for AI Trivia mode.
 */

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Generates trivia questions for a given topic.
 *
 * @param {string} topic   - The topic chosen by the host (e.g. "History", "Science")
 * @param {number} count   - Number of questions to generate
 * @returns {Promise<Array>} - Array of question objects
 *
 * Each question object:
 * {
 *   question: "What is the capital of Japan?",
 *   options: ["Beijing", "Tokyo", "Seoul", "Bangkok"],
 *   correct: 1   // 0-based index into options[]
 * }
 */
async function generateTriviaQuestions(topic, count = 8) {
  const prompt = `You are a trivia game master. Generate exactly ${count} multiple-choice trivia questions about the topic: "${topic}".

Rules:
- Each question must have exactly 4 answer options.
- Exactly one option must be correct.
- Questions should vary in difficulty (mix of easy, medium, hard).
- Keep questions clear and concise.
- Do NOT repeat questions.
- The correct answer index must be 0-based (0, 1, 2, or 3).

Respond ONLY with a valid JSON array. No explanation, no markdown, no extra text. Example format:
[
  {
    "question": "What is the capital of Japan?",
    "options": ["Beijing", "Tokyo", "Seoul", "Bangkok"],
    "correct": 1
  }
]`;

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  // Strip any accidental markdown fences before parsing
  const cleaned = rawText.replace(/```json|```/gi, "").trim();
  const questions = JSON.parse(cleaned);

  // Validate structure before trusting it
  if (!Array.isArray(questions)) {
    throw new Error("Claude did not return a JSON array");
  }

  questions.forEach((q, i) => {
    if (
      typeof q.question !== "string" ||
      !Array.isArray(q.options) ||
      q.options.length !== 4 ||
      typeof q.correct !== "number" ||
      q.correct < 0 ||
      q.correct > 3
    ) {
      throw new Error(`Invalid question format at index ${i}`);
    }
  });

  return questions;
}

/**
 * Generates Liar Game prompts — open-ended questions where players
 * must write a free-text answer and one player is secretly lying.
 *
 * @param {number} count - Number of prompts to generate
 * @returns {Promise<Array>} - Array of prompt strings
 */
async function generateLiarPrompts(count = 5) {
  const prompt = `You are a party game host. Generate exactly ${count} fun, personal, open-ended prompts for a social deduction game called "Liar Game".

Rules:
- Prompts should be fun and suitable for groups of friends.
- They should have answers unique enough that a liar can be detected, but common enough to be believable.
- Avoid sensitive or controversial topics.

Example prompts:
- "Name a movie that made you cry"
- "What would be your last meal?"
- "Name a country you'd never visit and why"

Respond ONLY with a valid JSON array of strings. No markdown, no explanation. Example:
["Name a movie that made you cry", "What is your most useless skill?"]`;

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  const cleaned = rawText.replace(/```json|```/gi, "").trim();
  const prompts = JSON.parse(cleaned);

  if (!Array.isArray(prompts) || prompts.some((p) => typeof p !== "string")) {
    throw new Error("Claude did not return a valid array of strings");
  }

  return prompts;
}

module.exports = { generateTriviaQuestions, generateLiarPrompts };