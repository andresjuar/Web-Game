/**
 * aiTrivia.js
 * Manages the full lifecycle of an AI Trivia game session.
 *
 * Flow:
 *   START_GAME → [Claude generates questions] → GAME_READY
 *   → NEXT_QUESTION loop → REVEAL_ANSWER → LEADERBOARD → repeat
 *   → GAME_OVER
 */

const {
  broadcastToAll,
  broadcastToPlayers,
  sendToHost,
  sendToPlayer,
  getLeaderboard,
  getPlayerList,
  calculatePoints,
  QUESTION_TIME,
} = require("../ws/roomManager");

const { generateTriviaQuestions } = require("../services/aiService");

/**
 * Called when the host presses START_GAME for ai_trivia mode.
 * Fetches questions from ai, then starts the game.
 */
async function startAiTrivia(room) {
  room.state = "loading";
  broadcastToAll(room, "LOADING", { message: "Generating questions..." });

  try {
    room.questions = await generateTriviaQuestions(room.topic, room.numQuestions);
    room.currentQuestion = -1;
    room.state = "ready";

    broadcastToAll(room, "GAME_READY", {
      totalQuestions: room.questions.length,
    });

    sendToHost(room, "AWAITING_NEXT", {
      message: "Press Next Question to begin!",
    });
  } catch (err) {
    console.error("[aiTrivia] Failed to generate questions:", err.message);
    broadcastToAll(room, "ERROR", {
      message: "Failed to generate questions. Please try again.",
    });
    room.state = "lobby";
  }
}

/**
 * Advances to the next question.
 * Called by the host via NEXT_QUESTION message.
 */
function nextQuestion(room) {
  room.currentQuestion += 1;

  // All questions answered → end game
  if (room.currentQuestion >= room.questions.length) {
    endGame(room);
    return;
  }

  const q = room.questions[room.currentQuestion];
  room.state = "question";
  room._questionStartedAt = Date.now(); // ← moved here from wsHandler

  // Reset per-round answer tracking
  Object.values(room.players).forEach((p) => {
    p.lastAnswerCorrect = false;
    p.lastPoints = 0;
    p._answeredAt = null;
  });

  const payload = {
    questionIndex: room.currentQuestion,
    totalQuestions: room.questions.length,
    question: q.question,
    options: q.options,
    timeLimit: QUESTION_TIME,
  };

  // Host sees the correct answer index; players do NOT
  sendToHost(room, "QUESTION", { ...payload, correct: q.correct });
  broadcastToPlayers(room, "QUESTION", payload);

  // Server-side countdown
  let secondsLeft = QUESTION_TIME;
  room.timer = setInterval(() => {
    secondsLeft--;

    // Broadcast tick to keep client timers in sync
    broadcastToAll(room, "TIMER_TICK", { secondsLeft });

    if (secondsLeft <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      revealAnswer(room);
    }
  }, 1000);
}

/**
 * Handles a player submitting an answer.
 * Called when a SUBMIT_ANSWER message arrives from a player socket.
 */
function handleAnswer(room, socketId, answerIndex) {
  if (room.state !== "question") return;

  const player = room.players[socketId];
  if (!player || player._answeredAt !== null) return; // already answered

  const q = room.questions[room.currentQuestion];
  const isCorrect = answerIndex === q.correct;
  const secondsLeft = getCurrentSecondsLeft(room);

  player._answeredAt = Date.now();
  player.lastAnswerCorrect = isCorrect;
  player.lastPoints = isCorrect ? calculatePoints(secondsLeft) : 0;

  // Acknowledge to the player (don't reveal correct yet)
  sendToPlayer(room, socketId, "ANSWER_RECEIVED", { received: true });

  // Tell the host how many have answered so far
  const answeredCount = Object.values(room.players).filter(
    (p) => p._answeredAt !== null
  ).length;
  const totalPlayers = Object.keys(room.players).length;

  sendToHost(room, "ANSWER_COUNT", { answeredCount, totalPlayers });

  // Auto-reveal once everyone has answered
  if (answeredCount === totalPlayers) {
    clearInterval(room.timer);
    room.timer = null;
    revealAnswer(room);
  }
}

/**
 * Reveals the correct answer to everyone.
 * Can be triggered by timer expiry, all players answering, or host pressing Reveal.
 */
function revealAnswer(room) {
  if (room.state !== "question") return;
  room.state = "reveal";

  const q = room.questions[room.currentQuestion];

  // Apply points to scores
  Object.values(room.players).forEach((p) => {
    p.score += p.lastPoints;
  });

  broadcastToAll(room, "ANSWER_REVEALED", {
    correct: q.correct,
    correctText: q.options[q.correct],
  });

  // After a short delay, send the leaderboard
  setTimeout(() => showLeaderboard(room), 2000);
}

/**
 * Sends the current leaderboard to everyone.
 */
function showLeaderboard(room) {
  room.state = "leaderboard";
  const leaderboard = getLeaderboard(room);

  sendToHost(room, "LEADERBOARD", { leaderboard });

  // Each player gets their own rank + score
  leaderboard.forEach((entry, index) => {
    sendToPlayer(room, entry.id, "YOUR_SCORE", {
      rank: index + 1,
      score: entry.score,
      lastPoints: entry.lastPoints,
      leaderboard,
    });
  });
}

/**
 * Ends the game and announces the winner.
 */
function endGame(room) {
  room.state = "finished";
  const leaderboard = getLeaderboard(room);
  const winner = leaderboard[0];

  broadcastToAll(room, "GAME_OVER", {
    winner: {
      name: winner.name,
      score: winner.score,
      victoryQuote: winner.victoryQuote,
    },
    leaderboard,
  });
}

// Helper

function getCurrentSecondsLeft(room) {
  if (!room._questionStartedAt) return QUESTION_TIME;
  const elapsed = Math.floor((Date.now() - room._questionStartedAt) / 1000);
  return Math.max(0, QUESTION_TIME - elapsed);
}

module.exports = { startAiTrivia, nextQuestion, handleAnswer, revealAnswer };