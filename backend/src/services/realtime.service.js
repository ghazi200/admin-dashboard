/**
 * Realtime service: publish events to Redis. WebSocket Gateway subscribes and emits to clients.
 * Use this instead of io.to(room).emit() so Core API stays stateless and Gateway handles connections.
 */

const logger = require("../logger");

let redisClient = null;
const CHANNEL = "realtime:events";

const EVENTS_FOR_OPEVENT = [
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

async function getPublisher() {
  if (redisClient) return redisClient;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    const { createClient } = require("redis");
    redisClient = createClient({ url });
    redisClient.on("error", (err) => logger.warn({ err: err.message }, "Redis realtime publisher error"));
    await redisClient.connect();
    return redisClient;
  } catch (e) {
    logger.warn({ err: e.message }, "Redis realtime publisher connect failed");
    return null;
  }
}

/**
 * Emit event to realtime channel. Gateway will emit to Socket.IO rooms.
 * Signature (app, rooms, type, payload) to match existing realtimePublish callers.
 * @param {object} app - Express app (for app.locals.models when creating OpEvent)
 * @param {string|string[]} rooms - Room name or array of rooms
 * @param {string} type - Event name (e.g. "shift_filled", "notification:new")
 * @param {object} payload - Event payload (serializable)
 */
async function emitToRealtime(app, rooms, type, payload) {
  const roomList = Array.isArray(rooms) ? rooms : [rooms].filter(Boolean);
  if (!roomList.length) return;

  const pub = await getPublisher();
  if (pub) {
    try {
      const msg = JSON.stringify({ rooms: roomList, type, payload: payload ?? {} });
      await pub.publish(CHANNEL, msg);
    } catch (e) {
      logger.warn({ err: e.message, type }, "Realtime publish failed");
    }
  }

  if (app?.locals?.models && EVENTS_FOR_OPEVENT.includes(type)) {
    try {
      const { createOpEventFromEvent } = require("./socketEventInterceptor");
      await createOpEventFromEvent(type, payload || {}, app.locals.models);
    } catch (e) {
      logger.warn({ err: e.message, type }, "OpEvent create from realtime failed");
    }
  }
}

module.exports = {
  getPublisher,
  emitToRealtime,
};
