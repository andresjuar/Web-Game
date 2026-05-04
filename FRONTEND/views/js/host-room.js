// ── Al cargar la página ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const code = sessionStorage.getItem('roomCode');

  // Mostrar el código en pantalla
  document.querySelector('.code-display').textContent = code;
  document.querySelector('.link-box span').textContent = `ricoquiz.app/join/${code}`;
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
  const types = ['ai_trivia', 'saved_quiz', 'liar_game'];
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

ws.on('LOADING', () => {
  window.location.href = '/host/loading.html';
});

ws.on('ERROR', ({ message }) => {
  alert(message);
});