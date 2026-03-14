/**
 * Realtime socket — thin wrapper around Socket Manager.
 * One connection for the app: connect after login, disconnect on logout.
 * Components only subscribe; they never disconnect.
 */

import socketManager from "./socketManager";

export function connectSocket() {
  return socketManager.connect();
}

export function connectAdminSocket() {
  return socketManager.connect();
}

export function disconnectSocket() {
  socketManager.disconnect();
}

export function getGatewaySocket() {
  return socketManager.getSocket();
}
