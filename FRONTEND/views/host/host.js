      // ── Estado local ──────────────────────────────────────────────────────────
      let selectedType = "ai_trivia";
      let totalPlayers = 0;
      let timerInterval = null;
      let currentCorrect = -1;
      let timeLimit = 15;

      const AVATARS = [
        "🐙",
        "🦊",
        "🐸",
        "🦁",
        "🐼",
        "🦄",
        "🐯",
        "🐧",
        "🦋",
        "🐻",
      ];
      const COLORS = [
        "bg-blue",
        "bg-yellow",
        "bg-red",
        "bg-green",
        "bg-pink",
        "bg-orange",
      ];

      // ── Navegación entre screens ──────────────────────────────────────────────
      function showScreen(id) {
        document
          .querySelectorAll(".screen")
          .forEach((s) => s.classList.remove("active"));
        document.getElementById(id).classList.add("active");
      }

      // ── Lobby ─────────────────────────────────────────────────────────────────
      document.addEventListener("DOMContentLoaded", () => {
        const code = sessionStorage.getItem("roomCode");
        document.getElementById("lobby-code").textContent = code || "----";
        document.getElementById("lobby-link").textContent =
          `ricoquiz.app/join/${code}`;
      });

      function copyLink() {
        const code = sessionStorage.getItem("roomCode");
        navigator.clipboard.writeText(`ricoquiz.app/join/${code}`);
      }

      function renderPlayers(players) {
        totalPlayers = players.length;
        document.getElementById("players-title").textContent =
          `PLAYERS (${players.length}/10)`;
        const grid = document.getElementById("players-grid");

        if (players.length === 0) {
          grid.innerHTML = `
          <div class="waiting-card">
            <h1 class="waiting-title">Waiting for players</h1>
            <div class="dots-container">
              <div class="dot"></div><div class="dot"></div><div class="dot"></div>
            </div>
          </div>`;
          return;
        }

        grid.innerHTML = players
          .map(
            (p, i) => `
        <div class="player-chip">
          <div class="player-avatar ${COLORS[i % COLORS.length]}">${p.avatar || AVATARS[i % AVATARS.length]}</div>
          <div class="player-name">${p.name}</div>
        </div>`,
          )
          .join("");
      }

      ws.on("PLAYER_JOINED", ({ players }) => renderPlayers(players));
      ws.on("PLAYER_LEFT", ({ players }) => renderPlayers(players));

      // ── Settings modal ────────────────────────────────────────────────────────
      function openModal() {
        document.getElementById("modal").classList.add("open");
      }
      function closeModal() {
        document.getElementById("modal").classList.remove("open");
      }
      function handleOverlay(e) {
        if (e.target === document.getElementById("modal")) closeModal();
      }

      function selectType(el, type) {
        document
          .querySelectorAll(".game-type")
          .forEach((c) => c.classList.remove("selected"));
        el.classList.add("selected");
        selectedType = type;
        document.getElementById("topic-section").style.display =
          type === "ai_trivia" ? "block" : "none";
      }

      function changeNum(d) {
        const el = document.getElementById("numVal");
        el.textContent = Math.max(
          3,
          Math.min(20, parseInt(el.textContent) + d),
        );
      }

      function saveSettings() {
        const topic = document.getElementById("topic-input").value.trim();
        const numQuestions = parseInt(
          document.getElementById("numVal").textContent,
        );
        if (selectedType === "ai_trivia" && !topic) {
          alert("Please enter a topic for AI Trivia.");
          return;
        }
        ws.send("SAVE_SETTINGS", {
          gameType: selectedType,
          topic,
          numQuestions,
        });
        closeModal();
      }

      // ── Start game ────────────────────────────────────────────────────────────
      document
        .getElementById("btn-start-game")
        .addEventListener("click", () => {
          ws.send("START_GAME");
        });

      ws.on("LOADING", () => {
        showScreen("screen-loading");
        animateLoadingBar();
      });

      // ── Liar Game: loading (evento distinto al de ai_trivia) ──────────────────
      ws.on("GAME_LOADING", () => {
        showScreen("screen-loading");
        animateLoadingBar();
      });

      // ── Liar Game: writing phase ──────────────────────────────────────────────
      ws.on(
        "LIAR_ROUND_START",
        ({ round, totalRounds, subjectName, question, writingTime }) => {
          document.getElementById("liar-round-badge").textContent =
            `ROUND ${round} OF ${totalRounds}`;
          document.getElementById("liar-subject-name").textContent =
            subjectName;
          document.getElementById("liar-writing-question").textContent =
            question;
          document.getElementById("liar-writing-timer").textContent =
            writingTime;
          document.getElementById("liar-writing-progress").textContent =
            `Waiting for answers... 0/${totalPlayers}`;
          showScreen("screen-liar-writing");
        },
      );

      ws.on("LIAR_WRITING_PROGRESS", ({ answered, total }) => {
        document.getElementById("liar-writing-progress").textContent =
          `Answers received: ${answered}/${total}`;
      });

      ws.on("LIAR_TIMER", ({ phase, remaining }) => {
        if (phase === "writing") {
          document.getElementById("liar-writing-timer").textContent = remaining;
        } else if (phase === "voting") {
          document.getElementById("liar-voting-timer").textContent = remaining;
        }
      });

      // ── Liar Game: voting phase ───────────────────────────────────────────────
      ws.on(
        "LIAR_VOTING_START",
        ({ question, subjectName, answers, votingTime }) => {
          document.getElementById("liar-voting-round-badge").textContent =
            document.getElementById("liar-round-badge").textContent;
          document.getElementById("liar-voting-subject").textContent =
            subjectName;
          document.getElementById("liar-voting-question").textContent =
            question;
          document.getElementById("liar-voting-timer").textContent = votingTime;
          document.getElementById("liar-voting-progress").textContent =
            `Votes cast: 0/${totalPlayers - 1}`;

          document.getElementById("liar-voting-answers").innerHTML = answers
            .map(
              (a) => `
          <div class="liar-answer-card">
            <div class="liar-answer-text">${a.text}</div>
          </div>`,
            )
            .join("");

          showScreen("screen-liar-voting");
        },
      );

      ws.on("LIAR_VOTING_PROGRESS", ({ voted, total }) => {
        document.getElementById("liar-voting-progress").textContent =
          `Votes cast: ${voted}/${total}`;
      });

      // ── Liar Game: reveal ─────────────────────────────────────────────────────
      ws.on(
        "LIAR_ROUND_REVEAL",
        ({
          question,
          answers,
          leaderboard,
          round,
          totalRounds,
          isLastRound,
        }) => {
          document.getElementById("liar-reveal-round-badge").textContent =
            `ROUND ${round} OF ${totalRounds}`;
          document.getElementById("liar-reveal-question").textContent =
            question;

          document.getElementById("liar-reveal-answers").innerHTML = answers
            .map(
              (a) => `
          <div class="liar-answer-card ${a.isTrue ? "is-true" : "is-lie"}">
            <div class="liar-answer-text">${a.text}</div>
            <div class="liar-answer-author">${a.isTrue ? "✅" : "🎭"} ${a.ownerName}</div>
          </div>`,
            )
            .join("");

          const rankLabels = ["🥇", "🥈", "🥉"];
          document.getElementById("liar-leaderboard").innerHTML = leaderboard
            .map(
              (p, i) => `
          <div class="leaderboard-row">
            <div class="lb-rank">${rankLabels[i] || i + 1}</div>
            <div class="lb-name">${p.name}</div>
            <div class="lb-points">${p.score} ${p.lastPoints > 0 ? `<span class="lb-delta">+${p.lastPoints}</span>` : ""}</div>
          </div>`,
            )
            .join("");

          const btnNext = document.getElementById("btn-liar-next");
          btnNext.textContent = isLastRound
            ? "See Final Results 🏆"
            : "Next Round ➔";

          showScreen("screen-liar-reveal");
        },
      );

      function animateLoadingBar() {
        const bar = document.getElementById("loading-bar");
        const status = document.getElementById("loading-status");
        const steps = [
          "Connecting...",
          "Setting up room...",
          "Generating questions...",
          "Almost ready!",
        ];
        let progress = 0,
          stepIndex = 0;

        const iv = setInterval(() => {
          progress += Math.random() * 12;
          if (progress >= 90) {
            progress = 90;
            clearInterval(iv);
          } // se queda en 90 hasta GAME_READY
          bar.style.width = progress + "%";
          const nextStep = Math.floor(progress / (100 / steps.length));
          if (nextStep > stepIndex && nextStep < steps.length) {
            stepIndex = nextStep;
            status.textContent = steps[stepIndex];
          }
        }, 500);
      }

      ws.on("GAME_READY", () => {
        // Completar la barra y esperar un momento antes de mostrar el botón
        document.getElementById("loading-bar").style.width = "100%";
        document.getElementById("loading-status").textContent = "Ready!";
        setTimeout(() => {
          ws.send("NEXT_QUESTION");
        }, 1000);
      });

      // ── Question ──────────────────────────────────────────────────────────────
      ws.on(
        "QUESTION",
        ({
          questionIndex,
          totalQuestions,
          question,
          options,
          correct,
          timeLimit: tl,
        }) => {
          currentCorrect = correct;
          timeLimit = tl || 15;

          document.getElementById("q-counter").textContent =
            `QUESTION ${questionIndex + 1} OF ${totalQuestions}`;
          document.getElementById("question-text").textContent = question;
          document.getElementById("responses-badge").textContent =
            `RESPONSES: 0/${totalPlayers}`;
          document.getElementById("btn-reveal").style.display = "block";

          // Render options
          const labels = ["A", "B", "C", "D"];
          const classes = ["opt-a", "opt-b", "opt-c", "opt-d"];
          const grid = document.getElementById("options-grid");
          grid.innerHTML = options
            .map(
              (opt, i) => `
        <div class="option-btn ${classes[i]}">
          <span class="option-label">${labels[i]}</span>
          <span>${opt}</span>
        </div>`,
            )
            .join("");

          // Timer
          startTimer(timeLimit);
          showScreen("screen-question");
        },
      );

      ws.on("TIMER_TICK", ({ secondsLeft }) => {
        document.getElementById("q-timer").textContent = secondsLeft;
        document.getElementById("timer-bar").style.width =
          `${(secondsLeft / timeLimit) * 100}%`;
      });

      ws.on("ANSWER_COUNT", ({ answeredCount, totalPlayers: tp }) => {
        document.getElementById("responses-badge").textContent =
          `RESPONSES: ${answeredCount}/${tp}`;
      });

      function startTimer(seconds) {
        document.getElementById("q-timer").textContent = seconds;
        document.getElementById("timer-bar").style.width = "100%";
      }

      function revealAnswer() {
        ws.send("REVEAL_ANSWER");
      }

      ws.on("ANSWER_REVEALED", ({ correct, correctText }) => {
        document.getElementById("btn-reveal").style.display = "none";
        const btns = document.querySelectorAll(".option-btn");
        btns.forEach((btn, i) => {
          if (i === correct) btn.classList.add("correct");
          else btn.classList.add("wrong");
        });
      });

      // ── Leaderboard ───────────────────────────────────────────────────────────
      ws.on("LEADERBOARD", ({ leaderboard }) => {
        const rankLabels = ["🥇", "🥈", "🥉"];
        const rankClasses = ["gold", "silver", "bronze"];

        document.getElementById("leaderboard-list").innerHTML = leaderboard
          .map(
            (p, i) => `
        <div class="leaderboard-row">
          <div class="lb-rank ${rankClasses[i] || ""}">${rankLabels[i] || i + 1}</div>
          <div class="lb-name">${p.name}</div>
          <div class="lb-points">
            ${p.score}
            ${p.lastPoints > 0 ? `<span class="lb-delta">+${p.lastPoints}</span>` : ""}
          </div>
        </div>`,
          )
          .join("");

        showScreen("screen-leaderboard");
      });

      function nextQuestion() {
        ws.send("NEXT_QUESTION");
      }

      // ── Game Over ─────────────────────────────────────────────────────────────
      ws.on("GAME_OVER", ({ winner, leaderboard }) => {
        document.getElementById("winner-title").textContent =
          `🎉 ${winner.name} is the Winner!`;
        document.getElementById("winner-name").textContent = winner.name;
        document.getElementById("winner-score").textContent =
          `${winner.score} pts`;
        document.getElementById("winner-quote").textContent =
          winner.victoryQuote ? `"${winner.victoryQuote}"` : "";

        // Podio (2do y 3ro)
        document.getElementById("winner-podium").innerHTML = leaderboard
          .slice(1, 3)
          .map(
            (p, i) => `
        <div class="podium-item">
          ${i === 0 ? "🥈" : "🥉"} ${p.name}<br>${p.score} pts
        </div>`,
          )
          .join("");

        showScreen("screen-winner");
      });

      // ── Errores ───────────────────────────────────────────────────────────────
      ws.on("ERROR", ({ message }) => alert(message));

      // ── Winner actions ────────────────────────────────────────────────────────
      function goHome() {
        sessionStorage.clear();
        window.location.href = "/host.html";
      }

      function playAgain() {
        sessionStorage.removeItem("roomCode");
        window.location.href = "/";
      }
