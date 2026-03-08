/**
 * Action Execution Service
 * 
 * Executes approved Command Center actions:
 * - Request backup guard
 * - Escalate to supervisor
 * - Trigger callout
 * - Request inspection
 * - Notify supervisor
 */

/**
 * Execute an approved action
 * @param {Object} action - CommandCenterAction instance
 * @param {Object} models - Sequelize models
 * @param {Object} app - Express app (for app.locals.emitToRealtime)
 * @returns {Promise<Object>} Execution result
 */
async function executeAction(action, models, app = null) {
  try {
    const { CommandCenterAction } = models;
    const actionType = action.action_type || action.type;
    const entityRefs = action.context || action.entity_refs || {};
    
    let result = {
      success: false,
      message: "",
      executedAt: new Date(),
    };

    switch (actionType) {
      case "REQUEST_BACKUP":
        result = await executeRequestBackup(action, entityRefs, models, app);
        break;

      case "ESCALATE_SUPERVISOR":
        result = await executeEscalateSupervisor(action, entityRefs, models, app);
        break;

      case "TRIGGER_CALLOUT":
        result = await executeTriggerCallout(action, entityRefs, models, app);
        break;

      case "REQUEST_INSPECTION":
        result = await executeRequestInspection(action, entityRefs, models, app);
        break;

      case "NOTIFY_SUPERVISOR":
        result = await executeNotifySupervisor(action, entityRefs, models, app);
        break;

      default:
        result.message = `Unknown action type: ${actionType}`;
    }

    // Update action status with execution details
    await CommandCenterAction.update(
      {
        status: result.success ? "EXECUTED" : "FAILED",
        executed_at: new Date(),
        outcome_json: result,
        updated_at: new Date(),
      },
      {
        where: { id: action.id },
      }
    );

    return result;
  } catch (error) {
    console.error(`❌ Error executing action ${action.id}:`, error);
    
    // Update action status to FAILED
    const { CommandCenterAction } = models;
    await CommandCenterAction.update(
      {
        status: "FAILED",
        updated_at: new Date(),
      },
      {
        where: { id: action.id },
      }
    );

    return {
      success: false,
      message: error.message || "Failed to execute action",
      executedAt: new Date(),
    };
  }
}

/**
 * Execute REQUEST_BACKUP action
 */
async function executeRequestBackup(action, entityRefs, models, app) {
  const { Shift, Guard } = models;
  const shiftId = entityRefs.shift_id;

  if (!shiftId) {
    return {
      success: false,
      message: "Shift ID not found in action entity_refs",
    };
  }

  try {
    // Find available guards (not on shift at that time)
    // For now, just log the request
    console.log(`📞 Requesting backup for shift: ${shiftId}`);
    
    // In a full implementation, you would:
    // 1. Query available guards for the shift time
    // 2. Create a callout request
    // 3. Send notifications to eligible guards
    
    const emitToRealtime = app?.locals?.emitToRealtime;
    if (emitToRealtime) {
      await emitToRealtime(app, "role:all", "action:backup_requested", {
        shiftId,
        actionId: action.id,
        description: action.description,
      }).catch(() => {});
    }

    return {
      success: true,
      message: `Backup request sent for shift ${shiftId}`,
      details: {
        shiftId,
        requestedAt: new Date(),
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to request backup: ${error.message}`,
    };
  }
}

/**
 * Execute ESCALATE_SUPERVISOR action
 */
async function executeEscalateSupervisor(action, entityRefs, models, app) {
  const { Notification, Admin } = models;
  const incidentId = entityRefs.incident_id;

  try {
    // Find supervisors/admins
    const supervisors = await Admin.findAll({
      where: {
        role: ["admin", "supervisor"],
      },
    });

    // Create notifications for supervisors
    const notifications = await Promise.all(
      supervisors.map(supervisor =>
        Notification.create({
          type: "ACTION_ESCALATION",
          title: "Escalation Required",
          message: action.description,
          entityType: "action",
          entityId: action.id,
          audience: "admin",
          meta: {
            actionId: action.id,
            incidentId,
            priority: "HIGH",
          },
        })
      )
    );

    if (io) {
      io.to("role:admin").to("role:supervisor").emit("notification:new", {
        type: "ACTION_ESCALATION",
        title: "Escalation Required",
        message: action.description,
      });
    }

    return {
      success: true,
      message: `Escalated to ${notifications.length} supervisor(s)`,
      details: {
        notifiedCount: notifications.length,
        notifiedAt: new Date(),
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to escalate: ${error.message}`,
    };
  }
}

/**
 * Execute TRIGGER_CALLOUT action
 */
async function executeTriggerCallout(action, entityRefs, models, app) {
  const { Shift, Guard } = models;
  const shiftId = entityRefs.shift_id;

  if (!shiftId) {
    return {
      success: false,
      message: "Shift ID not found in action entity_refs",
    };
  }

  try {
    // In a full implementation, you would:
    // 1. Query eligible guards
    // 2. Create callout records
    // 3. Send notifications
    
    console.log(`📞 Triggering callout for shift: ${shiftId}`);
    
    const emitToRealtime = app?.locals?.emitToRealtime;
    if (emitToRealtime) {
      await emitToRealtime(app, "role:all", "action:callout_triggered", {
        shiftId,
        actionId: action.id,
        description: action.description,
      }).catch(() => {});
    }

    return {
      success: true,
      message: `Callout campaign triggered for shift ${shiftId}`,
      details: {
        shiftId,
        triggeredAt: new Date(),
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to trigger callout: ${error.message}`,
    };
  }
}

/**
 * Execute REQUEST_INSPECTION action
 */
async function executeRequestInspection(action, entityRefs, models, app) {
  const { Guard, Shift } = models;
  const guardId = entityRefs.guard_id;
  const shiftId = entityRefs.shift_id;

  try {
    console.log(`📸 Requesting inspection for guard: ${guardId}, shift: ${shiftId}`);
    
    // In a full implementation, you would:
    // 1. Create inspection request
    // 2. Send push notification to guard
    // 3. Set deadline
    
    const emitToRealtime = app?.locals?.emitToRealtime;
    if (emitToRealtime) {
      await emitToRealtime(app, `guard:${guardId}`, "inspection:request", {
        guardId,
        shiftId,
        actionId: action.id,
        description: action.description,
      }).catch(() => {});
    }

    return {
      success: true,
      message: `Inspection requested for guard ${guardId}`,
      details: {
        guardId,
        shiftId,
        requestedAt: new Date(),
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to request inspection: ${error.message}`,
    };
  }
}

/**
 * Execute NOTIFY_SUPERVISOR action
 */
async function executeNotifySupervisor(action, entityRefs, models, app) {
  const { Notification, Admin } = models;

  try {
    // Find supervisors/admins
    const supervisors = await Admin.findAll({
      where: {
        role: ["admin", "supervisor"],
      },
    });

    // Create notifications
    const notifications = await Promise.all(
      supervisors.map(supervisor =>
        Notification.create({
          type: "ACTION_NOTIFICATION",
          title: action.description.split(":")[0] || "Action Notification",
          message: action.description,
          entityType: "action",
          entityId: action.id,
          audience: "admin",
          meta: {
            actionId: action.id,
            priority: action.ai_confidence > 0.8 ? "HIGH" : "MEDIUM",
          },
        })
      )
    );

    const emitToRealtime = app?.locals?.emitToRealtime;
    if (emitToRealtime) {
      await emitToRealtime(app, ["role:admin", "role:supervisor"], "notification:new", {
        type: "ACTION_NOTIFICATION",
        title: action.description.split(":")[0] || "Action Notification",
        message: action.description,
      }).catch(() => {});
    }

    return {
      success: true,
      message: `Notified ${notifications.length} supervisor(s)`,
      details: {
        notifiedCount: notifications.length,
        notifiedAt: new Date(),
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to notify supervisor: ${error.message}`,
    };
  }
}

module.exports = {
  executeAction,
};
