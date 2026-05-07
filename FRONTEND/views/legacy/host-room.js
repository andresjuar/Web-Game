// ── Al cargar la página ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const code = sessionStorage.getItem('roomCode');

  // Mostrar el código en pantalla
  document.querySelector('.code-display').textContent = code;
  document.querySelector('.link-box span').textContent = `ricoquiz.app/join/${code}`;
  renderPlayers([]);
});

// ── Jugadores entrando en tiempo real ─────────────────────────────────────────
ws.on('PLAYER_JOINED', ({ players }) => {
  renderPlayers(players);
});

ws.on('PLAYER_LEFT', ({ players }) => {
  renderPlayers(players);
});

const AVATARS = ['🐙','🦊','🐸','🦁','🐼','🦄','🐯','🐧','🦋','🐻'];
const COLORS  = ['bg-blue','bg-yellow','bg-red','bg-green'];

function renderPlayers(players) {
  
  const grid = document.querySelector('.players-grid');
  const title = document.querySelector('.players-title');

  title.textContent = `PLAYERS (${players.length}/10)`;

  if(players.length === 0){
    grid.innerHTML = `  <div class="waiting-card">
        <h1 class="waiting-title">Waiting for players</h1>
        
        <div class="dots-container">
          <div class="dot"></div>
          <div class="dot"></div>
          <div class="dot"></div>
        </div>
              `
                return;
  } 

  grid.innerHTML = players.map((p, i) => `
    <div class="player-chip">
      <div class="player-avatar ${COLORS[i % COLORS.length]}">
        ${AVATARS[i % AVATARS.length]}
      </div>
      <div class="player-name">${p.name}</div>
    </div>
  `).join('');
}

// ── Settings ──────────────────────────────────────────────────────────────────
let selectedType = 'ai_trivia';

function selectType(el) {
  document.querySelectorAll('.game-type').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const types = ['ai_trivia', 'liar_game'];
  const index = [...document.querySelectorAll('.game-type')].indexOf(el);
  selectedType = types[index];

  // Mostrar/ocultar campo de tema según el tipo
  const topicSection = document.getElementById('topic-section');
  topicSection.style.display = selectedType === 'ai_trivia' ? 'block' : 'none';
}

function saveSettings() {
  const topic = document.querySelector('.modal-input').value.trim();
  const numQuestions = parseInt(document.getElementById('numVal').textContent);

  if (selectedType === 'ai_trivia' && !topic) {
    alert('Por favor ingresa un tema para la trivia.');
    return;
  }

  ws.send('SAVE_SETTINGS', { gameType: selectedType, topic, numQuestions });
  closeModal();
}

// ── Start game ────────────────────────────────────────────────────────────────
document.querySelector('.btn-start').addEventListener('click', () => {
  ws.send('START_GAME');
});
let body = document.getElementById("in-game-body");

ws.on('LOADING', () => {
  body.classList.add(".body-in-game");
   body.innerHTML = `
    <div class="loading-container">

   <div class="logo-wrap">
      <div class="logo-badge">
        <div class="logo-text">RICO<span>QUIZ</span></div>
      </div>
      <p class="logo-sub">Play live with friends</p>
    </div>

  <div class="bar-wrap">
    <div class="bar-fill" id="bar"></div>
  </div>

  <div class="status-text" id="status">Starting...</div>

</div>

<script>
const bar = document.getElementById("bar");
const status = document.getElementById("status");

const steps = [
  "Connecting...",
  "Creating game roomm...",
  "Generating questions...",
  "Loading players...",
  "Ready!"
];

let progress = 0;
let stepIndex = 0;

const interval = setInterval(() => {
  progress += Math.random() * 15;
  
  if (progress >= 100) {
    progress = 100;
    bar.style.width = "100%";
    status.textContent = "¡Entering the game!";
    clearInterval(interval);

    return;
  }

  bar.style.width = progress + "%";

  if (progress > (stepIndex + 1) * (100 / steps.length)) {
    stepIndex++;
    status.textContent = steps[stepIndex];
  }

}, 500);
</script>

    `;
});



ws.on('ERROR', ({ message }) => {
  alert(message);
});

console.log("host room")