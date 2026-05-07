document.addEventListener("DOMContentLoaded", () => {
  // Si viene de un link /join/ABCD, extraer el código y guardarlo
  const pathParts = window.location.pathname.split("/");
  const codeFromUrl = pathParts[pathParts.length - 1]?.toUpperCase();

  if (codeFromUrl && codeFromUrl.length === 4) {
    sessionStorage.setItem("roomCode", codeFromUrl);
  }
});

// ── Estado local ────────────────────────────────────────────────────────────
let selectedAvatar = "👤";
let selectedAnswerIndex = -1;
let currentTimeLimit = 15;

const AVATARS = [
  "🐙",
  "🦊",
  "🐸",
  "🦁",
  "🐼",
  "🦄",
  "🐯",
  "🐧",
  "🦆",
  "🐻",
  "🐨",
  "🦅",
  "🐬",
  "🦊",
  "🐺",
  "🦁",
  "🐮",
  "🐷",
  "🐸",
  "🐵",
];

// ── Navegación ──────────────────────────────────────────────────────────────
function showScreen(id) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// ── Avatar modal ────────────────────────────────────────────────────────────
function openAvatarModal() {
  const grid = document.getElementById("avatar-grid");
  grid.innerHTML = AVATARS.map(
    (a) => `
      <div class="avatar-option" onclick="pickAvatar('${a}')">${a}</div>
    `,
  ).join("");
  document.getElementById("avatarModal").classList.add("open");
}

function pickAvatar(emoji) {
  selectedAvatar = emoji;
  document.getElementById("avatar-display").childNodes[0].textContent = emoji;
  document.getElementById("avatarModal").classList.remove("open");
}

// Cerrar modal al tocar afuera
document.getElementById("avatarModal").addEventListener("click", (e) => {
  if (e.target === document.getElementById("avatarModal")) {
    document.getElementById("avatarModal").classList.remove("open");
  }
});

// ── Setup: JOIN_ROOM ────────────────────────────────────────────────────────
document.getElementById("btn-ready").addEventListener("click", () => {
  const name = document.getElementById("playerName").value.trim();
  const victoryQuote = document.getElementById("victoryQuote").value.trim();
  const code = sessionStorage.getItem("roomCode");

  if (!name) {
    alert("Please enter your name.");
    return;
  }
  if (!code) {
    alert("No room code found.");
    return;
  }

  ws.send("JOIN_ROOM", { code, name, victoryQuote, avatar: selectedAvatar });
});

ws.on("JOINED_OK", ({ code, name }) => {
  sessionStorage.setItem("playerName", name);
  sessionStorage.setItem("role", "player");
  showScreen("screen-wait");
});

let isRejoining = false;

ws.on("JOIN_ERROR", ({ message }) => {
  if (isRejoining) {
    isRejoining = false;
    sessionStorage.clear();
    window.location.href = "/";
  } else {
    alert(message);
  }
});
// ── Waiting: escuchar eventos del host ──────────────────────────────────────
ws.on("LOADING", () => {
  showScreen("screen-wait");
});

// ── Liar Game: loading ──────────────────────────────────────────────────────
ws.on("GAME_LOADING", () => {
  showScreen("screen-wait");
});

// ── Liar Game: writing phase ────────────────────────────────────────────────
ws.on("LIAR_YOUR_TURN", ({ question, role, instruction }) => {
  const isSubject = role === "subject";
  const badge = document.getElementById("liar-role-badge");
  badge.textContent = isSubject
    ? "🎯 You're the Subject!"
    : "🎭 You're a Liar!";
  badge.className = "liar-role-badge " + (isSubject ? "is-subject" : "is-liar");

  document.getElementById("liar-write-label").textContent = isSubject
    ? "Your question"
    : "Write a convincing lie about";
  document.getElementById("liar-write-question").textContent = question;
  document.getElementById("liar-write-instruction").textContent = instruction;
  document.getElementById("liar-text-input").value = "";
  document.getElementById("btn-liar-submit").disabled = false;
  showScreen("screen-liar-write");
});

ws.on("LIAR_ANSWER_RECEIVED", () => {
  document.getElementById("btn-liar-submit").disabled = true;
  document.getElementById("btn-liar-submit").textContent = "Submitted! ✓";
});

function submitLiarText() {
  const text = document.getElementById("liar-text-input").value.trim();
  if (!text) {
    alert("Please write an answer first.");
    return;
  }
  ws.send("SUBMIT_TEXT", { text });
}

// ── Liar Game: subject waits during voting ──────────────────────────────────
ws.on("LIAR_WAIT_VOTING", ({ message }) => {
  document.getElementById("liar-wait-msg").textContent = message;
  showScreen("screen-liar-wait");
});

// ── Liar Game: voting phase ─────────────────────────────────────────────────
ws.on("LIAR_VOTING_START", ({ question, answers }) => {
  document.getElementById("liar-vote-question").textContent = question;

  document.getElementById("vote-list").innerHTML = answers
    .map(
      (a) => `
          <div class="vote-answer-card" onclick="submitVote('${a.answerId}', this)">
            ${a.text}
          </div>`,
    )
    .join("");

  showScreen("screen-liar-vote");
});

ws.on("LIAR_VOTE_RECEIVED", () => {
  document
    .querySelectorAll(".vote-answer-card")
    .forEach((c) => c.classList.add("disabled"));
});

function submitVote(answerId, el) {
  if (el.classList.contains("disabled")) return;
  document.querySelectorAll(".vote-answer-card").forEach((c) => {
    c.classList.add("disabled");
    c.classList.remove("selected");
  });
  el.classList.add("selected");
  ws.send("SUBMIT_VOTE", { votedForId: answerId });
}

// ── Liar Game: reveal ───────────────────────────────────────────────────────
ws.on("LIAR_ROUND_REVEAL", ({ question, answers, leaderboard }) => {
  const myName = sessionStorage.getItem("playerName");
  const myEntry = leaderboard.find((p) => p.name === myName);

  document.getElementById("liar-reveal-question").textContent = question;
  document.getElementById("liar-reveal-score").textContent =
    myEntry?.score || 0;
  document.getElementById("liar-reveal-delta").textContent =
    myEntry?.lastPoints > 0 ? `+${myEntry.lastPoints} this round` : "";

  document.getElementById("liar-reveal-list").innerHTML = answers
    .map(
      (a) => `
          <div class="liar-reveal-card ${a.isTrue ? "is-true" : "is-lie"}">
            <div class="reveal-answer-text">${a.text}</div>
            <div class="reveal-answer-author">${a.ownerName}</div>
            <div class="${a.isTrue ? "reveal-answer-truth" : "reveal-answer-lie"}">
              ${a.isTrue ? "✅ TRUE answer" : "🎭 Lie"}
            </div>
          </div>`,
    )
    .join("");

  showScreen("screen-liar-reveal");
});

// ── Answer: mostrar pregunta ────────────────────────────────────────────────
ws.on(
  "QUESTION",
  ({ questionIndex, totalQuestions, question, options, timeLimit }) => {
    currentTimeLimit = timeLimit || 15;
    selectedAnswerIndex = -1;

    document.getElementById("progress-badge").textContent =
      `${questionIndex + 1} of ${totalQuestions}`;
    document.getElementById("timer-badge").textContent =
      `0:${String(currentTimeLimit).padStart(2, "0")}`;
    document.getElementById("player-question-text").textContent = question;

    // Render opciones
    options.forEach((opt, i) => {
      document.getElementById(`opt-text-${i}`).textContent = opt;
    });

    // Reset estado visual
    document.querySelectorAll(".option-btn").forEach((btn) => {
      btn.classList.remove(
        "disabled",
        "dimmed",
        "selected",
        "correct-reveal",
        "wrong-reveal",
      );
    });
    document.getElementById("waitingMessage").classList.remove("visible");

    showScreen("screen-answer");
  },
);

// Actualizar timer
ws.on("TIMER_TICK", ({ secondsLeft }) => {
  const pad = String(secondsLeft).padStart(2, "0");
  document.getElementById("timer-badge").textContent = `0:${pad}`;
  // Poner rojo si quedan menos de 5s
  document.getElementById("timer-badge").style.background =
    secondsLeft <= 5 ? "#ff4444" : "var(--yellow)";
  document.getElementById("timer-badge").style.color =
    secondsLeft <= 5 ? "var(--white)" : "var(--black)";
});

// ── Answer: enviar respuesta ────────────────────────────────────────────────
function selectAnswer(index) {
  if (selectedAnswerIndex !== -1) return; // ya respondió
  selectedAnswerIndex = index;

  const btns = document.querySelectorAll(".option-btn");
  btns.forEach((btn, i) => {
    btn.classList.add("disabled");
    if (i === index) btn.classList.add("selected");
    else btn.classList.add("dimmed");
  });

  document.getElementById("waitingMessage").classList.add("visible");
  ws.send("SUBMIT_ANSWER", { answerIndex: index });
}

// ── Reveal: mostrar respuesta correcta ─────────────────────────────────────
ws.on("ANSWER_REVEALED", ({ correct }) => {
  const btns = document.querySelectorAll(".option-btn");
  btns.forEach((btn, i) => {
    btn.classList.remove("selected", "dimmed");
    if (i === correct) btn.classList.add("correct-reveal");
    else btn.classList.add("wrong-reveal");
  });
  document.getElementById("waitingMessage").classList.remove("visible");
});

// ── Results: mostrar ranking personal ──────────────────────────────────────
ws.on("YOUR_SCORE", ({ rank, score, lastPoints }) => {
  document.getElementById("rank-number").innerHTML =
    `${rank}<span class="rank-suffix">º</span>`;
  document.getElementById("score-value").textContent = score;
  document.getElementById("score-delta").textContent =
    lastPoints > 0 ? `+${lastPoints} this round` : "";
  showScreen("screen-results");
});

// ── Game Over ───────────────────────────────────────────────────────────────
ws.on("GAME_OVER", ({ winner, leaderboard }) => {
  const myName = sessionStorage.getItem("playerName");
  const myEntry = leaderboard.find((p) => p.name === myName);
  const myRank = leaderboard.indexOf(myEntry) + 1;
  const isWinner = myName === winner.name;

  document.getElementById("winner-emoji").textContent = isWinner
    ? "🏆"
    : myRank <= 3
      ? "🥈"
      : "🎮";
  document.getElementById("winner-name-display").textContent = winner.name;
  document.getElementById("winner-headline").innerHTML = isWinner
    ? `<span>${winner.name}</span> is the winner!`
    : `<span>${winner.name}</span> won the game!`;

  document.getElementById("final-rank").textContent = `${myRank}º`;
  document.getElementById("final-score").textContent =
    `${myEntry?.score || 0} pts`;

  // Mostrar victory quote si ganó
  if (isWinner && winner.victoryQuote) {
    document.getElementById("victory-quote-display").textContent =
      `"${winner.victoryQuote}"`;
  }

  showScreen("screen-winner");
});

// ── Errores y desconexión ───────────────────────────────────────────────────
ws.on("ERROR", ({ message }) => alert(message));

ws.on("HOST_DISCONNECTED", () => {
  alert("The host has left the game.");
  goHome();
});

// ── Volver al inicio ────────────────────────────────────────────────────────
function goHome() {
  sessionStorage.clear();
  window.location.href = "/";
}


ws.on("REJOINED_OK", ({ role, state, gameType, score, name }) => {
  if (role !== "player") return;

  // Actualizar score en sessionStorage por si cambió
  if (score !== undefined) {
    sessionStorage.setItem("playerScore", score);
  }

  const screenMap = {
    lobby:        "screen-wait",
    loading:      "screen-wait",
    ready:        "screen-wait",
    question:     "screen-answer",
    reveal:       "screen-answer",
    leaderboard:  "screen-results",
    finished:     "screen-winner",
    liar_writing: "screen-liar-write",
    liar_voting:  "screen-liar-vote",
    liar_reveal:  "screen-liar-reveal",
  };

  const screen = screenMap[state] || "screen-wait";
  showScreen(screen);
});


ws.on("GAME_RESET", () => {
  showScreen("screen-wait");
});