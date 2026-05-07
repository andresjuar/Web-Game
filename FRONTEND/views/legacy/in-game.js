let body = document.getElementById("in-game-body");

ws.on('GAME_READY', () => {
    body.innerHTML = `
    <div class="column-wrap">
    <div class="logo-wrap">
      <div class="logo-badge">
        <div class="logo-text">RICO<span>QUIZ</span></div>
      </div>
      <p class="logo-sub">Play live with friends</p>
    </div>
    <br>
    <div>
    <button class="btn-start">START GAME</button>
    </div>
    </div>
    
    `;
});

ws.on('GAME_READY', () => {
    body.innerHTML = `
    <div class="column-wrap">
    <div class="logo-wrap">
      <div class="logo-badge">
        <div class="logo-text">RICO<span>QUIZ</span></div>
      </div>
      <p class="logo-sub">Play live with friends</p>
    </div>
    <br>
    <div>
    <button class="btn-start">START GAME</button>
    </div>
    </div>
    
    `;
});


ws.on('ERROR', ({ message }) => {
  alert(message);
  window.location.href = '/host/host-sala.html';

});
