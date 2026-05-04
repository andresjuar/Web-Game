require("dotenv").config();
const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const path = require("path");
const { handleConnection } = require("./ws/wsHandler");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, "../FRONTEND")));

// ── REST routes ───────────────────────────────────────────────────────────────
app.get("/api/rooms/:code/exists", (req, res) => {
  const { rooms } = require("./ws/roomManager");
  const room = rooms[req.params.code.toUpperCase()];
  res.json({ exists: !!room, inProgress: room?.state !== "lobby" });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../FRONTEND/views/index.html"));
});
 
// ── WebSocket ─────────────────────────────────────────────────────────────────
wss.on("connection", handleConnection);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`RicoQuiz running on http://localhost:${PORT}`);
});