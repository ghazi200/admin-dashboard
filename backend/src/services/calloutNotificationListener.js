/**
 * Callout Notification Listener
 * 
 * Connects to abe-guard-ai Socket.IO server as a client
 * and listens for callout_started events to create notifications
 * Also creates OpEvents for Command Center feed
 */

const ioClient = require("socket.io-client");
const opsEventService = require("./opsEvent.service");

let clientSocket = null;
let isConnected = false;

/**
 * Initialize the socket client connection to abe-guard-ai.
 * Production: set ABE_GUARD_AI_URL; we never use localhost in production.
 */
function initCalloutNotificationListener(app) {
  const abeGuardAiUrl =
    process.env.ABE_GUARD_AI_URL ||
    (process.env.NODE_ENV !== "production" ? "http://localhost:4000" : null);
  if (!abeGuardAiUrl) {
    console.log("⚠️ ABE_GUARD_AI_URL not set in production; callout notification listener disabled.");
    return;
  }
  const { Notification } = app.locals.models;
  const emitToRealtime = app.locals.emitToRealtime;

  console.log(`🔌 Connecting to abe-guard-ai at ${abeGuardAiUrl} for callout notifications...`);

  // Create client socket connection
  // Note: abe-guard-ai might require auth, but for admin notifications we can connect without auth
  // or use a service token if needed
  clientSocket = ioClient(abeGuardAiUrl, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
    // Add auth if needed (for now, try without)
    // auth: {
    //   token: process.env.ABE_GUARD_AI_SERVICE_TOKEN || null,
    // },
  });

  clientSocket.on("connect", () => {
    isConnected = true;
    console.log("✅ Connected to abe-guard-ai socket server for callout notifications");
    
    // Join admin room (if needed)
    clientSocket.emit("join_admin");
  });

  clientSocket.on("disconnect", (reason) => {
    isConnected = false;
    console.log(`⚠️ Disconnected from abe-guard-ai: ${reason}`);
  });

  clientSocket.on("connect_error", (err) => {
    // Only log once per minute to avoid spam
    if (!clientSocket._lastErrorLog || Date.now() - clientSocket._lastErrorLog > 60000) {
      console.warn("⚠️ Callout notification listener: Unable to connect to abe-guard-ai socket (this is optional)");
      console.warn("💡 Make sure abe-guard-ai is running on port 4000 for real-time callout notifications");
      clientSocket._lastErrorLog = Date.now();
    }
  });

  // Listen for callout_started events
  clientSocket.on("callout_started", async (payload) => {
    try {
      console.log("📞 callout_started event received:", payload);
      
      const { shiftId, reason, callerGuardId, shift } = payload || {};
      
      if (!shiftId) {
        console.warn("⚠️ callout_started event missing shiftId");
        return;
      }

      // Get guard name from shift data or query database
      let guardName = "Guard";
      let shiftDate = null;
      let shiftStart = null;
      let shiftEnd = null;
      let location = null;

      if (shift) {
        guardName = shift.guard?.name || shift.guard?.email || `Guard ${String(callerGuardId || "").substring(0, 8)}`;
        shiftDate = shift.shift_date;
        shiftStart = shift.shift_start;
        shiftEnd = shift.shift_end;
        location = shift.location;
      } else {
        // Query database for shift and guard info
        const { sequelize } = app.locals.models;
        
        // First, get shift info
        const [shiftRows] = await sequelize.query(
          `SELECT shift_date, shift_start, shift_end, location
           FROM shifts
           WHERE id = $1
           LIMIT 1`,
          { bind: [shiftId] }
        );
        
        if (shiftRows.length > 0) {
          const row = shiftRows[0];
          shiftDate = row.shift_date;
          shiftStart = row.shift_start;
          shiftEnd = row.shift_end;
          location = row.location;
        }
        
        // Try to get guard name (guards table might use INTEGER or UUID)
        if (callerGuardId) {
          // Try UUID first (abe-guard-ai uses UUID)
          const [guardRows] = await sequelize.query(
            `SELECT name, email FROM guards WHERE id::text = $1 OR id = $1 LIMIT 1`,
            { bind: [callerGuardId] }
          );
          if (guardRows.length > 0) {
            guardName = guardRows[0].name || guardRows[0].email || `Guard ${String(callerGuardId).substring(0, 8)}`;
          } else {
            // Fallback to shortened UUID
            guardName = `Guard ${String(callerGuardId).substring(0, 8)}`;
          }
        }
      }

      const reasonText = reason || "Unknown reason";
      const shiftTime = shiftStart && shiftEnd ? `${shiftStart}-${shiftEnd}` : "N/A";
      const shiftDateText = shiftDate || "N/A";

      // Create notification
      const notification = await Notification.create({
        type: "CALLOUT_CREATED",
        title: "New Callout Created",
        message: `${guardName} has called out (${reasonText}) for shift on ${shiftDateText} ${shiftTime}`,
        entityType: "callout",
        entityId: null, // Using UUID, so storing in meta
        audience: "all",
        meta: {
          shiftId: shiftId,
          guardId: callerGuardId,
          guardName: guardName,
          reason: reasonText,
          shiftDate: shiftDate,
          shiftTime: shiftTime,
          location: location,
        },
      });

      console.log(`✅ Created callout notification: ${notification.id}`);

      if (emitToRealtime) {
        emitToRealtime(app, "role:all", "notification:new", notification).catch((e) => console.warn("Realtime emit failed:", e?.message));
        console.log("📤 Published notification:new to realtime (Gateway)");
      }

      // ✅ ENHANCED EVENT CAPTURE: Create OpEvent for Command Center
      try {
        const models = app.locals.models;
        if (models && models.OpEvent) {
          const opEvent = await opsEventService.createOpEvent(
            {
              tenant_id: tenantId,
              site_id: null, // Could extract from location if available
              type: "CALLOUT",
              severity: "MEDIUM",
              title: `Guard Callout: ${guardName}`,
              summary: `${guardName} called out (${reasonText}) for shift on ${shiftDateText} ${shiftTime}`,
              entity_refs: {
                callout_id: calloutId,
                guard_id: callerGuardId,
                shift_id: shiftId,
              },
              created_at: new Date(),
            },
            models,
            true // Enable AI tagging
          );
          if (opEvent) {
            console.log(`📊 Created OpEvent for callout: ${opEvent.id}`);
          }
        }
      } catch (opEventError) {
        // Don't fail notification creation if OpEvent creation fails
        console.warn("⚠️ Failed to create OpEvent for callout:", opEventError.message);
      }
    } catch (error) {
      console.error("❌ Error creating callout notification:", error);
    }
  });

  // Listen for callout_response events (when guard accepts/rejects)
  clientSocket.on("callout_response", async (payload) => {
    try {
      console.log("✅ callout_response event received:", payload);
      
      const { shiftId, guardId, calloutId, response, guardName, shiftDate, shiftTime, location } = payload || {};
      
      if (!shiftId || !guardId || !response) {
        console.warn("⚠️ callout_response event missing required fields");
        return;
      }

      // Get guard name if not provided
      let guardNameToUse = guardName || "Guard";
      if (!guardName) {
        try {
          const { sequelize } = app.locals.models;
          const [guardRows] = await sequelize.query(
            `SELECT name, email FROM guards WHERE id::text = $1 OR id = $1 LIMIT 1`,
            { bind: [guardId] }
          );
          if (guardRows.length > 0) {
            guardNameToUse = guardRows[0].name || guardRows[0].email || `Guard ${String(guardId).substring(0, 8)}`;
          }
        } catch (err) {
          console.warn("⚠️ Could not fetch guard name:", err.message);
        }
      }

      if (response === "ACCEPTED" || response === "YES") {
        console.log(`🎉 GUARD ACCEPTED SHIFT!`);
        console.log(`   Guard: ${guardNameToUse} (${guardId.substring(0, 8)}...)`);
        console.log(`   Shift ID: ${shiftId.substring(0, 8)}...`);
        console.log(`   Date: ${shiftDate || "N/A"}, Time: ${shiftTime || "N/A"}`);
        console.log(`   Location: ${location || "N/A"}`);
        console.log(`   Callout ID: ${calloutId ? calloutId.substring(0, 8) + "..." : "N/A"}`);
      } else if (response === "REJECTED" || response === "NO") {
        console.log(`❌ Guard rejected shift:`);
        console.log(`   Guard: ${guardNameToUse} (${guardId.substring(0, 8)}...)`);
        console.log(`   Shift ID: ${shiftId.substring(0, 8)}...`);
      } else {
        console.log(`📝 Guard response: ${response}`);
        console.log(`   Guard: ${guardNameToUse} (${guardId.substring(0, 8)}...)`);
        console.log(`   Shift ID: ${shiftId.substring(0, 8)}...`);
      }
    } catch (error) {
      console.error("❌ Error processing callout_response event:", error);
    }
  });

  // Also listen for shift_filled events to create linked notifications
  clientSocket.on("shift_filled", async (payload) => {
    try {
      console.log("✅ shift_filled event received:", payload);
      
      const { shiftId, guardId, calloutId, tenantId, guardName } = payload || {};
      
      if (!shiftId || !guardId) {
        console.warn("⚠️ shift_filled event missing required fields");
        return;
      }

      // Get guard name if not provided
      let guardNameToUse = guardName || "Guard";
      if (!guardName) {
        try {
          const { sequelize } = app.locals.models;
          const [guardRows] = await sequelize.query(
            `SELECT name, email FROM guards WHERE id::text = $1 OR id = $1 LIMIT 1`,
            { bind: [guardId] }
          );
          if (guardRows.length > 0) {
            guardNameToUse = guardRows[0].name || guardRows[0].email || `Guard ${String(guardId).substring(0, 8)}`;
          }
        } catch (err) {
          console.warn("⚠️ Could not fetch guard name:", err.message);
        }
      }

      console.log(`🎉 SHIFT FILLED!`);
      console.log(`   Guard: ${guardNameToUse} (${guardId.substring(0, 8)}...)`);
      console.log(`   Shift ID: ${shiftId.substring(0, 8)}...`);
      console.log(`   Callout ID: ${calloutId ? calloutId.substring(0, 8) + "..." : "N/A"}`);

      // ✅ ENHANCED EVENT CAPTURE: Create OpEvent for shift filled
      try {
        const models = app.locals.models;
        if (models && models.OpEvent) {
          const opEvent = await opsEventService.createOpEvent(
            {
              tenant_id: tenantId || null,
              site_id: null,
              type: "SHIFT",
              severity: "LOW",
              title: "Shift Filled",
              summary: `Shift ${shiftId} filled by guard ${guardNameToUse}${calloutId ? ` (callout: ${calloutId})` : ""}`,
              entity_refs: {
                shift_id: shiftId,
                guard_id: guardId,
                callout_id: calloutId || null,
              },
              created_at: new Date(),
            },
            models,
            true // Enable AI tagging
          );
          if (opEvent) {
            console.log(`📊 Created OpEvent for shift filled: ${opEvent.id}`);
          }
        }
      } catch (opEventError) {
        console.warn("⚠️ Failed to create OpEvent for shift_filled:", opEventError.message);
      }

      // The shift closure notification with callout tracking is already handled
      // in adminShifts.controller.js updateShift function
    } catch (error) {
      console.error("❌ Error processing shift_filled event:", error);
    }
  });

  // ✅ ENHANCED EVENT CAPTURE: Listen for incident events
  clientSocket.on("incidents:new", async (payload) => {
    try {
      console.log("📊 incidents:new event received for OpEvent creation:", payload);
      
      const { incident, tenantId } = payload || {};
      if (!incident) {
        return;
      }

      const models = app.locals.models;
      if (models && models.OpEvent) {
        const opEvent = await opsEventService.createOpEvent(
          {
            tenant_id: incident.tenant_id || tenantId || null,
            site_id: incident.site_id || null,
            type: "INCIDENT",
            severity: incident.severity || "MEDIUM",
            title: `Incident: ${incident.type || "Unknown"}`,
            summary: incident.description || incident.ai_summary || "New incident reported",
            entity_refs: {
              incident_id: incident.id,
            },
            created_at: new Date(incident.reported_at || incident.created_at || new Date()),
          },
          models,
          true // Enable AI tagging
        );
        if (opEvent) {
          console.log(`📊 Created OpEvent for incident: ${opEvent.id}`);
        }
      }
    } catch (error) {
      console.warn("⚠️ Failed to create OpEvent for incident:", error.message);
    }
  });

  // ✅ ENHANCED EVENT CAPTURE: Listen for incident updates
  clientSocket.on("incidents:updated", async (payload) => {
    try {
      const { incident, tenantId } = payload || {};
      if (!incident) {
        return;
      }

      const models = app.locals.models;
      if (models && models.OpEvent) {
        const opEvent = await opsEventService.createOpEvent(
          {
            tenant_id: incident.tenant_id || tenantId || null,
            site_id: incident.site_id || null,
            type: "INCIDENT",
            severity: incident.severity || "MEDIUM",
            title: `Incident Updated: ${incident.type || "Unknown"}`,
            summary: `Incident ${incident.id} status changed to ${incident.status || "Unknown"}`,
            entity_refs: {
              incident_id: incident.id,
            },
            created_at: new Date(),
          },
          models,
          true // Enable AI tagging
        );
        if (opEvent) {
          console.log(`📊 Created OpEvent for incident update: ${opEvent.id}`);
        }
      }
    } catch (error) {
      console.warn("⚠️ Failed to create OpEvent for incident update:", error.message);
    }
  });

  return clientSocket;
}

/**
 * Disconnect the socket client
 */
function disconnectCalloutNotificationListener() {
  if (clientSocket) {
    clientSocket.disconnect();
    clientSocket = null;
    isConnected = false;
    console.log("🔌 Disconnected from abe-guard-ai socket server");
  }
}

module.exports = {
  initCalloutNotificationListener,
  disconnectCalloutNotificationListener,
  isConnected: () => isConnected,
};
