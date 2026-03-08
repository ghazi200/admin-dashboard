const smartNotificationService = require("../services/smartNotification.service");

async function notify(app, payload) {
  const { Notification } = app.locals.models;

  // Analyze notification with smart service
  const notificationData = {
    type: payload.type,
    title: payload.title,
    message: payload.message,
    entityType: payload.entityType || null,
    entityId: payload.entityId || null,
    meta: payload.meta || null,
    created_at: new Date(),
  };

  // Get smart analysis (non-blocking, with timeout)
  let smartAnalysis = null;
  try {
    const analysisPromise = smartNotificationService.analyzeNotification(
      notificationData,
      { recentEvents: payload.recentEvents || [] }
    );
    // Timeout after 2 seconds to avoid blocking
    smartAnalysis = await Promise.race([
      analysisPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
  } catch (error) {
    console.warn("⚠️ Smart notification analysis failed, using defaults:", error.message);
  }

  // Save to DB with smart metadata (wrap in try-catch to prevent DB errors from failing)
  let created;
  try {
    // Convert entityId to string if it's a UUID (to handle type mismatch)
    let entityIdValue = payload.entityId || null;
    if (entityIdValue && typeof entityIdValue !== 'string') {
      entityIdValue = String(entityIdValue);
    }
    
    created = await Notification.create({
      type: payload.type,
      title: payload.title,
      message: payload.message,
      entityType: payload.entityType || null,
      entityId: entityIdValue, // Use converted value
      audience: payload.audience || "all",
      meta: payload.meta || null,
      // Smart fields
      priority: smartAnalysis?.priority || null,
      category: smartAnalysis?.category || null,
      urgency: smartAnalysis?.urgency || null,
      smartMetadata: smartAnalysis?.smartMetadata || null,
      aiInsights: smartAnalysis?.aiInsights || null,
      quickActions: smartAnalysis?.quickActions || null,
    });

    const emitToRealtime = app.locals.emitToRealtime;
    if (emitToRealtime) {
      emitToRealtime(app, "role:all", "notification:new", created).catch((emitError) => {
        console.warn("⚠️ Failed to emit notification (non-fatal):", emitError?.message);
      });
    }
  } catch (dbError) {
    console.error("⚠️ Failed to create notification (non-fatal):", dbError.message);
    // Return a minimal notification object so the main request doesn't fail
    created = {
      id: null,
      type: payload.type,
      title: payload.title,
      message: payload.message,
    };
  }

  return created;
}

module.exports = { notify };
