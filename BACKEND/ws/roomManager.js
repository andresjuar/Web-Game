/**
 * roomManager.js
 * Manages all active game rooms in memory.
 * Each room holds its own state, players, questions, and timer.
 */

const rooms = {};

// Room code generation

// Avoid visually ambiguous characters and numbers (0, O, I, 1)
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateRoomCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () =>
      CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    ).join("");
  } while (rooms[code]); // ensure uniqueness
  return code;
}

// Room lifecycle

function createRoom(hostSocket) {
  const code = generateRoomCode();
  rooms[code] = {
    code,
    hostSocket,
    // Game settings (set by host before starting)
    gameType: null,       // "ai_trivia" / "liar_game"
    topic: null,          // for ai_trivia
    numQuestions: 8,      // default
    // Game state machine
    state: "lobby",       // lobby -> loading -> question -> reveal -> leaderboard -> finished
    // Players map: socketId -> playerData
    players: {},
    // Questions array (populated by Claude or manually)
    questions: [],
    currentQuestion: -1,
    // Timer reference so we can clear it
    timer: null,
    // For liar game: track answers and votes per round
    liarRound: null,
  };
  return rooms[code];
}

function getRoom(code) {
  return rooms[code] || null;
}

function deleteRoom(code) {
  const room = rooms[code];
  if (room?.timer) clearInterval(room.timer);
  delete rooms[code];
}

// Player management 

function addPlayer(room, socket, name, victoryQuote) {
  const id = socket.id;
  room.players[id] = {
    socket,
    name,
    victoryQuote: victoryQuote || "",
    score: 0,
    lastAnswerCorrect: false,
    lastPoints: 0,
    // For liar game
    isLiar: false,
    textAnswer: null,
    vote: null,
  };
  return room.players[id];
}

function removePlayer(room, socketId) {
  delete room.players[socketId];
}

function getPlayerList(room) {
  return Object.values(room.players).map((p) => ({
    id: Object.keys(room.players).find((k) => room.players[k] === p),
    name: p.name,
    score: p.score,
  }));
}

// Leaderboard 

function getLeaderboard(room) {
  return Object.entries(room.players)
    .map(([id, p]) => ({
      id,
      name: p.name,
      score: p.score,
      lastPoints: p.lastPoints,
      victoryQuote: p.victoryQuote,
    }))
    .sort((a, b) => b.score - a.score);
}

// Broadcast helpers 

/**
 * Send a message to all connected players in the room.
 */
function broadcastToPlayers(room, type, payload = {}) {
  const msg = JSON.stringify({ type, payload });
  Object.values(room.players).forEach(({ socket }) => {
    if (socket.readyState === 1) socket.send(msg); // 1 = OPEN
  });
}

/**
 * Send a message to one specific player.
 */
function sendToPlayer(room, socketId, type, payload = {}) {
  const player = room.players[socketId];
  if (player?.socket?.readyState === 1) {
    player.socket.send(JSON.stringify({ type, payload }));
  }
}

/**
 * Send a message to the host.
 */
function sendToHost(room, type, payload = {}) {
  if (room.hostSocket?.readyState === 1) {
    room.hostSocket.send(JSON.stringify({ type, payload }));
  }
}

/**
 * Send a message to everyone (host + all players).
 */
function broadcastToAll(room, type, payload = {}) {
  sendToHost(room, type, payload);
  broadcastToPlayers(room, type, payload);
}

// Score calculation

const MAX_POINTS = 1000;
const QUESTION_TIME = 15; // seconds

/**
 * Returns points earned based on how quickly the player answered.
 * Full points if answered immediately, minimum 100 if answered at the last second.
 */
function calculatePoints(secondsRemaining) {
  const ratio = secondsRemaining / QUESTION_TIME;
  return Math.round(100 + (MAX_POINTS - 100) * ratio);
}

module.exports = {
  rooms,
  createRoom,
  getRoom,
  deleteRoom,
  addPlayer,
  removePlayer,
  getPlayerList,
  getLeaderboard,
  broadcastToPlayers,
  sendToPlayer,
  sendToHost,
  broadcastToAll,
  calculatePoints,
  QUESTION_TIME,
};