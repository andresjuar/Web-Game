// host
document.getElementById('btn-create').addEventListener('click', () => {
  ws.send('CREATE_ROOM');
});

ws.on('ROOM_CREATED', ({ code }) => {
  sessionStorage.setItem('roomCode', code);
  sessionStorage.setItem('role', 'host');
  window.location.href = 'host/host.html';
});

ws.on('JOIN_ERROR', ({ message }) => {
  alert(message);
});