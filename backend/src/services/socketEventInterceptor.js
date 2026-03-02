/**
 * Socket Event Interceptor
 * 
 * Intercepts Socket.IO events and standardizes them into OpEvents.
 * This should be initialized when the Socket.IO server starts.
 */

const opsEventService = require("./opsEvent.service");

/**
 * Initialize Socket.IO event interceptor
 * @param {Object} io - Socket.IO server instance
 * @param {Object} models - Sequelize models
 */
function initSocketEventInterceptor(io, models) {
  // List of events to intercept and standardize
  const eventsToIntercept = [
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

  // Intercept events by hooking into io.emit
  const originalEmit = io.emit.bind(io);
  const originalTo = io.to.bind(io);

  // Override io.emit to intercept events
  io.emit = function (eventName, ...args) {
    // Call original emit
    const result = originalEmit(eventName, ...args);

    // Intercept and standardize if in our list
    if (eventsToIntercept.includes(eventName)) {
      handleEvent(eventName, args[0], models).catch((err) => {
        console.error(`❌ Error intercepting event ${eventName}:`, err);
      });
    }

    return result;
  };

  // Also intercept io.to().emit()
  io.to = function (room) {
    const roomEmitter = originalTo(room);
    const originalRoomEmit = roomEmitter.emit.bind(roomEmitter);

    roomEmitter.emit = function (eventName, ...args) {
      // Call original emit
      const result = originalRoomEmit(eventName, ...args);

      // Intercept and standardize if in our list
      if (eventsToIntercept.includes(eventName)) {
        handleEvent(eventName, args[0], models).catch((err) => {
          console.error(`❌ Error intercepting room event ${eventName}:`, err);
        });
      }

      return result;
    };

    return roomEmitter;
  };
}

/**
 * Handle intercepted event
 * @param {String} eventName
 * @param {Object} payload
 * @param {Object} models
 */
async function handleEvent(eventName, payload, models) {
  try {
    // Standardize event
    const standardizedEvent = opsEventService.standardizeEvent(
      {
        type: eventName,
        ...payload,
      },
      {
        tenantId: payload.tenant_id || payload.tenantId,
        siteId: payload.site_id || payload.siteId,
      }
    );

    // Create OpEvent (async, don't block)
    await opsEventService.createOpEvent(standardizedEvent, models);

    // Log for debugging (can be removed in production)
    if (process.env.NODE_ENV === "development") {
      console.log(`📊 OpEvent created: ${standardizedEvent.type} - ${standardizedEvent.title}`);
    }
  } catch (error) {
    // Don't throw - event interception shouldn't break the original event
    console.error(`⚠️ Failed to create OpEvent for ${eventName}:`, error.message);
  }
}

/**
 * Manually create OpEvent from event data (for events already emitted)
 * Useful for retroactive event creation or manual event logging
 * @param {String} eventName
 * @param {Object} payload
 * @param {Object} models
 */
async function createOpEventFromEvent(eventName, payload, models) {
  const standardizedEvent = opsEventService.standardizeEvent(
    {
      type: eventName,
      ...payload,
    },
    {
      tenantId: payload.tenant_id || payload.tenantId,
      siteId: payload.site_id || payload.siteId,
    }
  );

  return await opsEventService.createOpEvent(standardizedEvent, models);
}

module.exports = {
  initSocketEventInterceptor,
  createOpEventFromEvent,
};
