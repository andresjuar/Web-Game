/**
 * wsClient.js
 * Shared WebSocket client for all pages.
 * Attach to window so any page can use it.
 *
 * Usage:
 *   ws.send("CREATE_ROOM")
 *   ws.send("JOIN_ROOM", { code: "ABCD", name: "Diego" })
 *   ws.on("PLAYER_JOINED", (payload) => { ... })
 */

const ws = (() => {
  const url = `ws://${location.host}`;
  let socket = null;
  const handlers = {}; // type -> [callbacks]

  function connect() {
    socket = new WebSocket(url);

    socket.addEventListener("open", () => {
      console.log("[WS] Connected");
      // Attempt rejoin if we have a saved session
      const code = sessionStorage.getItem("roomCode");
      const name = sessionStorage.getItem("playerName");
      if (code && name) {
        send("REJOIN_ROOM", { code, name });
      }
    });

    socket.addEventListener("message", (event) => {
      const { type, payload } = JSON.parse(event.data);
      console.log("[WS] ←", type, payload);
      (handlers[type] || []).forEach((fn) => fn(payload));
    });

    socket.addEventListener("close", () => {
      console.warn("[WS] Connection closed. Reconnecting in 2s...");
      setTimeout(connect, 2000);
    });

    socket.addEventListener("error", (err) => {
      console.error("[WS] Error:", err);
    });
  }

  function send(type, payload = {}) {
    if (socket?.readyState === WebSocket.OPEN) {
      console.log("[WS] →", type, payload);
      socket.send(JSON.stringify({ type, payload }));
    } else {
      console.warn("[WS] Not connected, queuing is not implemented yet.");
    }
  }

  function on(type, callback) {
    if (!handlers[type]) handlers[type] = [];
    handlers[type].push(callback);
  }

  function off(type, callback) {
    handlers[type] = (handlers[type] || []).filter((fn) => fn !== callback);
  }

  connect();
  return { send, on, off };
})();