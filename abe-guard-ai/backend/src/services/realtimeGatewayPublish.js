/**
 * Publish to Redis channel `realtime:events` so websocket-gateway can emit to admin/guard clients.
 * Same JSON shape as backend/src/services/realtime.service.js (rooms + type + payload).
 *
 * Set REDIS_URL on abe-guard-ai Railway to the **same** Redis instance as the gateway + admin backend.
 */

const CHANNEL = "realtime:events";

let client = null;
let connectFailed = false;

async function getPublisher() {
  if (connectFailed) return null;
  const url = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL || "";
  if (!url || !/^rediss?:\/\//i.test(String(url).trim())) return null;
  if (client) return client;
  try {
    const { createClient } = require("redis");
    client = createClient({ url: url.trim() });
    client.on("error", (err) => {
      if (process.env.DEBUG_REDIS === "1") console.warn("realtimeGatewayPublish redis:", err.message);
    });
    await client.connect();
    return client;
  } catch (e) {
    connectFailed = true;
    console.warn("realtimeGatewayPublish: Redis connect failed — admin schedule live refresh may lag until refetch:", e.message);
    return null;
  }
}

/**
 * @param {string|string[]} rooms - e.g. "role:all", "tenant:<uuid>"
 * @param {string} type - Event name (must match Schedule.jsx listeners: shift_filled, callout_started, …)
 * @param {object} payload
 */
async function publishToGateway(rooms, type, payload) {
  const roomList = (Array.isArray(rooms) ? rooms : [rooms]).filter(Boolean);
  if (!roomList.length || !type) return;
  const pub = await getPublisher();
  if (!pub) return;
  try {
    await pub.publish(
      CHANNEL,
      JSON.stringify({ rooms: roomList, type, payload: payload && typeof payload === "object" ? payload : {} })
    );
  } catch (e) {
    console.warn("realtimeGatewayPublish publish failed:", e.message);
  }
}

function publishToGatewayLazy(rooms, type, payload) {
  publishToGateway(rooms, type, payload).catch((e) =>
    console.warn("realtimeGatewayPublish:", e.message)
  );
}

function roomsForTenant(tenantId) {
  const r = ["role:all"];
  if (tenantId && /^[0-9a-f-]{36}$/i.test(String(tenantId).trim())) {
    r.push(`tenant:${String(tenantId).trim()}`);
  }
  return r;
}

module.exports = { publishToGateway, publishToGatewayLazy, roomsForTenant };
