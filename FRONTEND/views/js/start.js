// host
document.getElementById('btn-create').addEventListener('click', () => {
  ws.send('CREATE_ROOM');
});

ws.on('ROOM_CREATED', ({ code }) => {
  sessionStorage.setItem('roomCode', code);
  sessionStorage.setItem('role', 'host');
  window.location.href = 'host/host-sala.html';
});

//player
ws.on('JOINED_OK', ({ code, name }) => {
  sessionStorage.setItem('roomCode', code);
  sessionStorage.setItem('playerName', name);
  sessionStorage.setItem('role', 'player');
  window.location.href = '/player/player-setup.html';
});

ws.on('JOIN_ERROR', ({ message }) => {
  alert(message);
});