/**
 * Realtime sockets are DISABLED. No socket.io-client is used — no WebSocket connections.
 * Dashboard and other pages use polling/refetch instead.
 * To re-enable later: restore the previous socket.js that imports socket.io-client and set REACT_APP_USE_REALTIME=true.
 */

let adminSocket = null;

export function connectSocket() {
  return null;
}

export function connectAdminSocket() {
  return null;
}

export function disconnectSocket() {
  adminSocket = null;
}

export { adminSocket };
