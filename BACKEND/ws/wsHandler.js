/**
 * Main WebSocket message router.
 *
 * Every message follows this structure:
 *   { "type": "EVENT_NAME", "payload": { ...data } }
 *
 * This file decides which handler to call based on message type
 * and whether the sender is a host or a player.
 */

const {
  rooms,
  createRoom,
  getRoom,
  deleteRoom,
  addPlayer,
  removePlayer,
  getPlayerList,
  broadcastToAll,
  broadcastToPlayers,
  sendToHost,
  sendToPlayer,
} = require("./roomManager");

const aiTrivia = require("./aiTrivia");
const liarGame = require("./liarGame");

// Socket identity helpers

// Attach a simple unique ID to each socket on connection
let _socketIdCounter = 0;
function assignSocketId(socket) {
  socket.id = `s_${++_socketIdCounter}`;
}

// Find which room a socket belongs to, and whether it's the host or a player
function findSocketContext(socket) {
  for (const room of Object.values(rooms)) {
    if (room.hostSocket === socket) {
      return { room, role: "host" };
    }
    if (room.players[socket.id]) {
      return { room, role: "player" };
    }
  }
  return null;
}

// Main handler 

function handleConnection(socket) {
  assignSocketId(socket);
  console.log(`[WS] New connection: ${socket.id}`);

  socket.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      socket.send(JSON.stringify({ type: "ERROR", payload: { message: "Invalid JSON" } }));
      return;
    }

    const { type, payload = {} } = msg;
    console.log(`[WS] ${socket.id} → ${type}`, payload);

    // Route to the correct handler
    switch (type) {
      // ── Room management ────────────────────────────────────────────────────
      case "CREATE_ROOM":     return handleCreateRoom(socket);
      case "JOIN_ROOM":       return handleJoinRoom(socket, payload);
      case "REJOIN_ROOM":     return handleRejoinRoom(socket, payload);

      // ── Host: game settings & flow control ─────────────────────────────────
      case "SAVE_SETTINGS":   return handleSaveSettings(socket, payload);
      case "START_GAME":      return handleStartGame(socket);
      case "NEXT_QUESTION":   return handleNextQuestion(socket);
      case "REVEAL_ANSWER":   return handleRevealAnswer(socket);
      case "FORCE_REVEAL":    return handleForceReveal(socket); // liar game

      // ── Player: answers & votes ────────────────────────────────────────────
      case "SUBMIT_ANSWER":   return handleSubmitAnswer(socket, payload);
      case "SUBMIT_TEXT":     return handleSubmitText(socket, payload);  // liar game
      case "SUBMIT_VOTE":     return handleSubmitVote(socket, payload);  // liar game

      default:
        socket.send(JSON.stringify({ type: "ERROR", payload: { message: `Unknown event: ${type}` } }));
    }
  });

  socket.on("close", () => handleDisconnect(socket));
  socket.on("error", (err) => console.error(`[WS] Error on ${socket.id}:`, err.message));
}

// Room management

function handleCreateRoom(socket) {
  const room = createRoom(socket);
  socket.send(JSON.stringify({
    type: "ROOM_CREATED",
    payload: { code: room.code },
  }));
  console.log(`[WS] Room created: ${room.code}`);
}

function handleJoinRoom(socket, { code, name, victoryQuote }) {
  const room = getRoom(code?.toUpperCase());

  if (!room) {
    socket.send(JSON.stringify({ type: "JOIN_ERROR", payload: { message: "Room not found." } }));
    return;
  }
  if (room.state !== "lobby") {
    socket.send(JSON.stringify({ type: "JOIN_ERROR", payload: { message: "Game already in progress." } }));
    return;
  }
  if (Object.keys(room.players).length >= 10) {
    socket.send(JSON.stringify({ type: "JOIN_ERROR", payload: { message: "Room is full (max 10 players)." } }));
    return;
  }

  const safeName = (name || "Player").trim().substring(0, 20);
  addPlayer(room, socket, safeName, victoryQuote);

  // Confirm to player
  socket.send(JSON.stringify({
    type: "JOINED_OK",
    payload: { code: room.code, name: safeName },
  }));

  // Notify host
  sendToHost(room, "PLAYER_JOINED", {
    players: getPlayerList(room),
  });

  console.log(`[WS] ${safeName} joined room ${room.code}`);
}

function handleRejoinRoom(socket, { code, name }) {
  const room = getRoom(code?.toUpperCase());
  if (!room) {
    socket.send(JSON.stringify({ type: "JOIN_ERROR", payload: { message: "Room not found." } }));
    return;
  }

  // Find player by name (best effort reconnect)
  const entry = Object.entries(room.players).find(([, p]) => p.name === name);
  if (!entry) {
    socket.send(JSON.stringify({ type: "JOIN_ERROR", payload: { message: "Player not found in room." } }));
    return;
  }

  const [oldId, player] = entry;
  // Reassign socket
  delete room.players[oldId];
  player.socket = socket;
  room.players[socket.id] = player;

  socket.send(JSON.stringify({
    type: "REJOINED_OK",
    payload: { code: room.code, name: player.name, score: player.score, state: room.state },
  }));

  console.log(`[WS] ${player.name} rejoined room ${room.code}`);
}

// Host: settings & flow

function handleSaveSettings(socket, { gameType, topic, numQuestions }) {
  const ctx = findSocketContext(socket);
  if (!ctx || ctx.role !== "host") return;
  const { room } = ctx;

  room.gameType = gameType;
  room.topic = topic || "";
  room.numQuestions = Math.min(Math.max(Number(numQuestions) || 8, 3), 20);

  socket.send(JSON.stringify({
    type: "SETTINGS_SAVED",
    payload: { gameType, topic: room.topic, numQuestions: room.numQuestions },
  }));
}

function handleStartGame(socket) {
  const ctx = findSocketContext(socket);
  if (!ctx || ctx.role !== "host") return;
  const { room } = ctx;

  if (Object.keys(room.players).length < 1) {
    socket.send(JSON.stringify({ type: "ERROR", payload: { message: "Need at least 1 player to start." } }));
    return;
  }
  if (!room.gameType) {
    socket.send(JSON.stringify({ type: "ERROR", payload: { message: "Please select a game type in Settings." } }));
    return;
  }

  if (room.gameType === "ai_trivia") {
    aiTrivia.startAiTrivia(room);
  } else if (room.gameType === "liar_game") {
    liarGame.startLiarGame(room);
  }
}

function handleNextQuestion(socket) {
  const ctx = findSocketContext(socket);
  if (!ctx || ctx.role !== "host") return;
  const { room } = ctx;

  if (room.gameType === "ai_trivia") {
    room._questionStartedAt = Date.now();
    aiTrivia.nextQuestion(room);
  } else if (room.gameType === "liar_game") {
    liarGame.nextRound(room);
  }
}

function handleRevealAnswer(socket) {
  const ctx = findSocketContext(socket);
  if (!ctx || ctx.role !== "host") return;
  const { room } = ctx;

  if (room.gameType === "ai_trivia" && room.state === "question") {
    if (room.timer) { clearInterval(room.timer); room.timer = null; }
    aiTrivia.revealAnswer(room);
  }
}

function handleForceReveal(socket) {
  const ctx = findSocketContext(socket);
  if (!ctx || ctx.role !== "host") return;
  const { room } = ctx;

  if (room.gameType === "liar_game") {
    liarGame.forceReveal(room);
  }
}

// Player: answers 

function handleSubmitAnswer(socket, { answerIndex }) {
  const ctx = findSocketContext(socket);
  if (!ctx || ctx.role !== "player") return;
  const { room } = ctx;

  if (room.gameType === "ai_trivia") {
    aiTrivia.handleAnswer(room, socket.id, Number(answerIndex));
  }
}

function handleSubmitText(socket, { text }) {
  const ctx = findSocketContext(socket);
  if (!ctx || ctx.role !== "player") return;
  const { room } = ctx;

  if (room.gameType === "liar_game") {
    liarGame.handleTextAnswer(room, socket.id, text || "");
  }
}

function handleSubmitVote(socket, { votedForId }) {
  const ctx = findSocketContext(socket);
  if (!ctx || ctx.role !== "player") return;
  const { room } = ctx;

  if (room.gameType === "liar_game") {
    liarGame.handleVote(room, socket.id, votedForId);
  }
}

// Disconnect

function handleDisconnect(socket) {
  console.log(`[WS] Disconnected: ${socket.id}`);
  const ctx = findSocketContext(socket);
  if (!ctx) return;

  const { room, role } = ctx;

  if (role === "host") {
    // Host left -> notify all players and destroy room
    broadcastToPlayers(room, "HOST_DISCONNECTED", {
      message: "The host has left the game.",
    });
    deleteRoom(room.code);
    console.log(`[WS] Room ${room.code} destroyed (host left)`);
  } else {
    // Player left
    const player = room.players[socket.id];
    const name = player?.name || "A player";
    removePlayer(room, socket.id);

    sendToHost(room, "PLAYER_LEFT", {
      players: getPlayerList(room),
      name,
    });

    console.log(`[WS] ${name} left room ${room.code}`);
  }
}

module.exports = { handleConnection };