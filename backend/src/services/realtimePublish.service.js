/**
 * Publish realtime events to Redis. WebSocket Gateway subscribes and emits to clients.
 * Use this instead of io.to(room).emit() when REDIS_URL is set.
 */

const { createClient } = require("redis");
const { createOpEventFromEvent } = require("./socketEventInterceptor");

const EVENTS_FOR_OP_EVENT = [
  "incidents:new",
  "incidents:updated",
  "callout_started",
  "callout:new",
  "inspection:request",
  "inspection:submitted",
  "inspection:request:created",
  "guard_clocked_in",
  "guard_clocked_out",
  "guard_lunch_started",
  "guard_lunch_ended",
  "shift_filled",
  "shift:created",
];

let redisClient = null;
let connectPromise = null;

function getRedis() {
  if (!process.env.REDIS_URL) return null;
  if (redisClient) return redisClient;
  redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.on("error", (err) => console.warn("Redis realtime publish:", err.message));
  return redisClient;
}

async function ensureConnected() {
  const r = getRedis();
  if (!r) return null;
  if (r.isReady) return r;
  if (!connectPromise) connectPromise = r.connect().catch(() => null);
  await connectPromise;
  return r.isReady ? r : null;
}

/**
 * Publish event to Redis for WebSocket Gateway to broadcast.
 * @param {Object} app - Express app (for app.locals.models when creating OpEvent)
 * @param {string|string[]} rooms - Room(s) to emit to (e.g. "role:all" or ["role:admin", "role:supervisor"])
 * @param {string} type - Event name (e.g. "shift_filled", "notification:new")
 * @param {*} payload - Event payload (object)
 */
async function emitToRealtime(app, rooms, type, payload) {
  const roomList = Array.isArray(rooms) ? rooms : [rooms].filter(Boolean);
  const r = await ensureConnected();
  if (r) {
    const msg = JSON.stringify({ rooms: roomList, type, payload: payload ?? {} });
    await r.publish("realtime:events", msg).catch((e) => console.warn("Redis publish failed:", e.message));
  }
  if (app?.locals?.models && EVENTS_FOR_OP_EVENT.includes(type)) {
    createOpEventFromEvent(type, payload ?? {}, app.locals.models).catch((e) =>
      console.warn("OpEvent create failed for", type, e.message)
    );
  }
}

module.exports = {
  emitToRealtime,
  getRedis,
};
