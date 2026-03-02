// backend/src/controllers/emergencySOS.controller.js
const { Guard, Admin, Tenant, EmergencyEvent, EmergencyContact } = require("../models");
const { Op } = require("sequelize");

/**
 * POST /emergency/sos
 * Trigger emergency SOS alert
 */
exports.triggerEmergencySOS = async (req, res) => {
  try {
    const guardId = req.user?.guardId || req.user?.id;
    if (!guardId) {
      return res.status(401).json({ message: "Missing guard identity (auth)" });
    }

    const { lat, lng, accuracy } = req.body;

    // Get guard info
    const guard = await Guard.findByPk(guardId);
    if (!guard) {
      return res.status(404).json({ message: "Guard not found" });
    }

    const tenantId = guard.tenant_id;

    // Auto-dial on-call supervisor
    let dialStatus = "no_phone";
    let supervisorPhone = null;

    // Find on-call supervisor (admin or supervisor role in same tenant)
    let onCallSupervisor = null;
    if (tenantId) {
      onCallSupervisor = await Admin.findOne({
        where: {
          tenant_id: tenantId,
          role: { [Op.in]: ["admin", "supervisor"] },
          // TODO: Add on_call field to Admin model to track who's on call
        },
        order: [["created_at", "ASC"]], // Fallback to first admin/supervisor
      });
    }

    // If no tenant-specific supervisor, find any admin
    if (!onCallSupervisor) {
      onCallSupervisor = await Admin.findOne({
        where: {
          role: { [Op.in]: ["admin", "supervisor", "super_admin"] },
        },
        order: [["created_at", "ASC"]],
      });
    }

    // Create emergency event record (store in database)
    let emergencyEvent;
    try {
      emergencyEvent = await EmergencyEvent.create({
        guard_id: guardId,
        tenant_id: tenantId,
        supervisor_id: onCallSupervisor?.id || null,
        latitude: lat || null,
        longitude: lng || null,
        accuracy: accuracy || null,
        status: "active",
        activated_at: new Date(),
      });
    } catch (dbError) {
      console.error("❌ Failed to create emergency event:", dbError);
      // Continue even if DB save fails (non-critical)
      emergencyEvent = {
        id: `temp_${Date.now()}`,
        guard_id: guardId,
        tenant_id: tenantId,
        supervisor_id: onCallSupervisor?.id || null,
        activated_at: new Date(),
      };
    }

    console.log("🚨 EMERGENCY SOS ACTIVATED:", {
      emergencyEventId: emergencyEvent.id,
      guardId,
      guardName: guard.name || guard.email,
      tenantId,
      supervisor: onCallSupervisor
        ? {
            id: onCallSupervisor.id,
            name: onCallSupervisor.name || onCallSupervisor.email,
            phone: supervisorPhone,
          }
        : null,
      location: lat && lng ? { lat, lng, accuracy } : null,
    });

    // Emit real-time notification to admins/supervisors
    const io = req.app.get("io");
    if (io) {
      const emergencyPayload = {
        type: "EMERGENCY_SOS",
        emergencyEventId: emergencyEvent.id,
        guardId,
        guardName: guard.name || guard.email,
        tenantId,
        supervisor: onCallSupervisor
          ? {
              id: onCallSupervisor.id,
              name: onCallSupervisor.name || onCallSupervisor.email,
              email: onCallSupervisor.email,
              phone: supervisorPhone,
            }
          : null,
        location: lat && lng ? { lat, lng, accuracy } : null,
        timestamp: new Date().toISOString(),
      };

      // Emit to all admins and supervisors
      io.to("admins").to("super_admin").emit("emergency:sos", emergencyPayload);

      // Also emit to tenant-specific admin room if tenant exists
      if (tenantId) {
        io.to(`admins:${tenantId}`).emit("emergency:sos", emergencyPayload);
      }

      console.log("📤 Emergency SOS event emitted to admin/supervisor rooms");
    }

    // Try to get phone from admin (if phone field exists in future)
    // For now, check if there's a way to get it from tenant or other source
    if (onCallSupervisor) {
      // TODO: Add phone field to Admin model or get from tenant settings
      // For now, we'll attempt to auto-dial using browser's tel: protocol
      // The frontend will handle the actual dialing
      
      // Check if supervisor has phone in any available field
      supervisorPhone = onCallSupervisor.phone || 
                       onCallSupervisor.phone_number || 
                       onCallSupervisor.mobile ||
                       null;
      
      if (supervisorPhone) {
        console.log(`📞 Auto-dial supervisor: ${supervisorPhone}`);
        dialStatus = "initiated"; // Frontend will handle the dial
      } else {
        console.log("⚠️ Supervisor found but no phone number available");
        dialStatus = "no_phone";
      }
    } else {
      console.log("⚠️ No on-call supervisor found");
      dialStatus = "no_supervisor";
    }

    return res.json({
      ok: true,
      message: "Emergency SOS activated. Supervisors have been notified.",
      emergency: {
        id: emergencyEvent.id,
        guardId,
        guardName: guard.name || guard.email,
        supervisor: onCallSupervisor
          ? {
              id: onCallSupervisor.id,
              name: onCallSupervisor.name || onCallSupervisor.email,
              email: onCallSupervisor.email,
              phone: supervisorPhone,
            }
          : null,
        dialStatus,
        location: lat && lng ? { lat, lng, accuracy } : null,
        activatedAt: emergencyEvent.activated_at,
      },
    });
  } catch (e) {
    console.error("❌ Emergency SOS error:", e);
    console.error("❌ Error stack:", e.stack);
    if (e.errors) {
      console.error("❌ Sequelize validation errors:", e.errors);
    }
    return res.status(500).json({
      message: "Failed to activate emergency SOS",
      error: e.message,
      details: e.errors ? e.errors.map(err => err.message) : undefined,
      stack: process.env.NODE_ENV === "development" ? e.stack : undefined,
    });
  }
};

/**
 * GET /emergency/contacts
 * Get guard's emergency contacts
 */
exports.getEmergencyContacts = async (req, res) => {
  try {
    const guardId = req.user?.guardId || req.user?.id;
    if (!guardId) {
      return res.status(401).json({ message: "Missing guard identity (auth)" });
    }

    const contacts = await EmergencyContact.findAll({
      where: { guard_id: guardId },
      order: [["created_at", "DESC"]],
    });

    return res.json(contacts);
  } catch (e) {
    console.error("❌ Get emergency contacts error:", e);
    return res.status(500).json({
      message: "Failed to load emergency contacts",
      error: e.message,
    });
  }
};

/**
 * POST /emergency/contacts
 * Add emergency contact for guard
 */
exports.addEmergencyContact = async (req, res) => {
  try {
    const guardId = req.user?.guardId || req.user?.id;
    if (!guardId) {
      return res.status(401).json({ message: "Missing guard identity (auth)" });
    }

    const { name, phone } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ message: "Name and phone are required" });
    }

    // Get guard to get tenant_id
    const guard = await Guard.findByPk(guardId);
    if (!guard) {
      return res.status(404).json({ message: "Guard not found" });
    }

    const contact = await EmergencyContact.create({
      guard_id: guardId,
      tenant_id: guard.tenant_id || null,
      name: name.trim(),
      phone: phone.trim(),
      created_at: new Date(),
    });

    return res.json(contact);
  } catch (e) {
    console.error("❌ Add emergency contact error:", e);
    return res.status(500).json({
      message: "Failed to add emergency contact",
      error: e.message,
    });
  }
};
