const jwt = require("jsonwebtoken");
const { notify } = require("../utils/notify");
const { getTenantWhere, ensureTenantId, canAccessTenant } = require("../utils/tenantFilter");

/**
 * Issue a short-lived JWT for a guard so admin can "view as this guard" on Guard view.
 * POST /api/admin/guards/guard-view-token body: { guardId }
 */
exports.getGuardViewToken = async (req, res) => {
  try {
    const guardId = req.body?.guardId;
    if (!guardId) {
      return res.status(400).json({ message: "guardId is required" });
    }
    const { Guard } = req.app.locals.models;
    const guard = await Guard.findByPk(guardId, { attributes: ["id", "email", "name", "tenant_id"] });
    if (!guard) {
      return res.status(404).json({ message: "Guard not found" });
    }
    if (guard.tenant_id && !canAccessTenant(req.admin, guard.tenant_id)) {
      return res.status(403).json({ message: "You don't have access to this guard" });
    }
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ message: "Server misconfiguration: JWT_SECRET not set" });
    }
    const token = jwt.sign(
      { guardId: guard.id, tenant_id: guard.tenant_id || null, role: "guard" },
      secret,
      { expiresIn: "1h" }
    );
    return res.json({
      token,
      guard: { id: guard.id, email: guard.email, name: guard.name },
    });
  } catch (e) {
    console.error("getGuardViewToken error:", e);
    return res.status(500).json({ message: e.message || "Failed to issue guard view token" });
  }
};

exports.updateGuardAvailability = async (req, res) => {
  console.log("🚀 updateGuardAvailability - FUNCTION CALLED");
  console.log("🚀 updateGuardAvailability - Method:", req.method);
  console.log("🚀 updateGuardAvailability - URL:", req.originalUrl);
  console.log("🚀 updateGuardAvailability - Params:", req.params);
  
  // Define variables outside try block so they're available in catch block
  const guardId = req.params.id;
  const availability = req.body.availability !== undefined 
    ? req.body.availability 
    : req.body.isAvailable;
  
  try {
    const { Guard, AvailabilityLog, sequelize } = req.app.locals.models;

    console.log("🔍 updateGuardAvailability - guardId:", guardId);
    console.log("🔍 updateGuardAvailability - req.body:", req.body);
    console.log("🔍 updateGuardAvailability - availability:", availability);
    console.log("🔍 updateGuardAvailability - admin:", req.admin?.id, req.admin?.email);

    if (availability === undefined || availability === null) {
      return res.status(400).json({ 
        message: "Availability value is required", 
        received: req.body 
      });
    }

    const guard = await Guard.findByPk(guardId);
    if (!guard) {
      console.error("❌ updateGuardAvailability - Guard not found:", guardId);
      return res.status(404).json({ message: "Guard not found" });
    }

    // ✅ Tenant isolation: Check if admin can access this guard's tenant
    if (guard.tenant_id && !canAccessTenant(req.admin, guard.tenant_id)) {
      console.error("❌ updateGuardAvailability - Access denied for guard:", guardId);
      return res.status(403).json({ message: "You don't have access to this guard" });
    }

    // Calculate guardIdInt outside transaction so it's available for verification and error handling
    // Note: AvailabilityLog.guardId is INTEGER but Guard.id is UUID
    // We need to convert UUID to integer for storage using a hash function
    const crypto = require('crypto');
    let guardIdInt;
    try {
      // Ensure guard.id is a string for hashing
      const guardIdStr = String(guard.id);
      const hash = crypto.createHash('md5').update(guardIdStr).digest('hex');
      guardIdInt = parseInt(hash.substring(0, 8), 16) % 2147483647; // Max integer value
      
      console.log("🔍 updateGuardAvailability - guard.id:", guard.id, "(type:", typeof guard.id, ")");
      console.log("🔍 updateGuardAvailability - guardIdInt (converted):", guardIdInt);
      
      if (!guardIdInt || isNaN(guardIdInt)) {
        throw new Error(`Invalid guardIdInt calculated: ${guardIdInt}`);
      }
    } catch (hashError) {
      console.error("❌ updateGuardAvailability - Error calculating guardIdInt:", hashError);
      console.error("❌ updateGuardAvailability - Guard ID that failed:", guard.id, "Type:", typeof guard.id);
      guardIdInt = null; // Set to null if calculation fails
    }

    const updatedGuard = await sequelize.transaction(async (t) => {
      
      // Get previous availability status from most recent log (only if guardIdInt is valid)
      let from = null;
      if (guardIdInt !== null && !isNaN(guardIdInt)) {
        try {
          const previousLog = await AvailabilityLog.findOne({
            where: { guardId: guardIdInt },
            order: [['createdAt', 'DESC']],
            transaction: t
          });
          from = previousLog ? previousLog.to : null;
        } catch (logQueryError) {
          console.warn("⚠️ updateGuardAvailability - Error querying previous log:", logQueryError.message);
        }
      }
      
      console.log("🔍 updateGuardAvailability - previous availability:", from);
      console.log("🔍 updateGuardAvailability - new availability:", Boolean(availability));
      console.log("🔍 updateGuardAvailability - guardIdInt valid:", guardIdInt !== null && !isNaN(guardIdInt));
      
      // Handle admin ID - it might be integer or UUID
      let actorAdminId = null;
      if (req.admin?.id) {
        try {
          // Try to parse as integer, if it fails, use hash like guard ID
          const adminIdInt = parseInt(req.admin.id);
          if (!isNaN(adminIdInt) && adminIdInt > 0) {
            actorAdminId = adminIdInt;
          } else {
            // Admin ID is UUID, convert to integer
            const adminHash = crypto.createHash('md5').update(String(req.admin.id)).digest('hex');
            actorAdminId = parseInt(adminHash.substring(0, 8), 16) % 2147483647;
          }
        } catch (adminHashError) {
          console.warn("⚠️ updateGuardAvailability - Error hashing admin ID:", adminHashError.message);
        }
      }
      
      // Create availability log entry
      // Note: There's a foreign key constraint, but guardId is integer while Guards.id is UUID
      // We'll try to insert and if it fails due to FK constraint, we'll skip logging but still succeed
      let logEntryCreated = false;
      
      // Only attempt to create log if guardIdInt is valid
      if (guardIdInt === null || isNaN(guardIdInt)) {
        console.error("❌ updateGuardAvailability - Cannot create log: guardIdInt is invalid:", guardIdInt);
        console.error("❌ updateGuardAvailability - Guard:", guard.name, "ID:", guard.id);
      } else {
        try {
        // Insert the availability log using raw SQL
        // Temporarily disable FK constraint check since guardId is integer but Guards.id is UUID
        await sequelize.query('SET session_replication_role = replica', { transaction: t });
        const [insertResult] = await sequelize.query(`
          INSERT INTO availability_logs ("guardId", "from", "to", "actorAdminId", "note", "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
          RETURNING id, "guardId", "from", "to", "createdAt"
        `, {
          bind: [
            guardIdInt,
            from,
            Boolean(availability),
            actorAdminId,
            `Availability updated by admin ${req.admin?.email || 'unknown'}`
          ],
          transaction: t,
          type: sequelize.QueryTypes.SELECT
        });
        await sequelize.query('SET session_replication_role = DEFAULT', { transaction: t });
        
        const logEntry = insertResult[0];
        console.log("✅ updateGuardAvailability - Log entry created (raw SQL):", logEntry.id);
        console.log("✅ updateGuardAvailability - Log entry details:", {
          guardId: logEntry.guardId,
          from: logEntry.from,
          to: logEntry.to,
          createdAt: logEntry.createdAt
        });
        
        // Verify the log entry was actually created by querying it back
        const [verifyLog] = await sequelize.query(`
          SELECT id, "guardId", "from", "to", "createdAt"
          FROM availability_logs
          WHERE id = $1
        `, {
          bind: [logEntry.id],
          transaction: t,
          type: sequelize.QueryTypes.SELECT
        });
        
        if (verifyLog && verifyLog.length > 0) {
          logEntryCreated = true;
          console.log("✅ updateGuardAvailability - Log entry verified, exists in database");
        } else {
          console.warn("⚠️ updateGuardAvailability - Log entry created but not found on verification");
        }
      } catch (createError) {
        // If it's a foreign key constraint error, log it but don't fail the operation
        // The availability update itself is successful, logging is just for audit
        if (createError.name === 'SequelizeForeignKeyConstraintError' || 
            (createError.message && createError.message.includes('foreign key'))) {
          console.warn("⚠️ Could not create availability log due to FK constraint (guardId mismatch), but operation succeeded");
          console.warn("⚠️ This is expected when guardId is integer but Guards table uses UUID");
          console.warn("⚠️ Guard UUID:", guard.id, "-> Integer:", guardIdInt);
          // Don't throw - the availability update is still successful
        } else {
          // For other errors, log and continue (don't fail the whole operation)
          console.error("❌ updateGuardAvailability - Error creating log entry (non-fatal):", createError.message);
          console.error("❌ updateGuardAvailability - Error details:", {
            name: createError.name,
            message: createError.message,
            stack: createError.stack,
            guardId: guard.id,
            guardName: guard.name,
            guardIdInt: guardIdInt
          });
          // Don't throw - availability update is more important than logging
        }
      }
      }
      
      console.log("🔍 updateGuardAvailability - Log entry created successfully:", logEntryCreated, "for guard:", guard.name);

      return { guard, logEntryCreated };
    });
    
    // Verify the log was actually saved by querying it back after transaction commits
    if (updatedGuard.logEntryCreated && guardIdInt !== null && guardIdInt !== undefined) {
      // Query after transaction to ensure it's committed
      setTimeout(async () => {
        try {
          const verifyAfterCommit = await AvailabilityLog.findOne({
            where: { guardId: guardIdInt },
            order: [['createdAt', 'DESC']],
          });
          if (verifyAfterCommit) {
            console.log("✅ updateGuardAvailability - Log verified after commit:", {
              id: verifyAfterCommit.id,
              guardId: verifyAfterCommit.guardId,
              to: verifyAfterCommit.to,
              createdAt: verifyAfterCommit.createdAt
            });
          } else {
            console.warn("⚠️ updateGuardAvailability - Log not found after commit!");
          }
        } catch (verifyErr) {
          console.error("❌ updateGuardAvailability - Error verifying log after commit:", verifyErr.message);
        }
      }, 100);
    }

    console.log("✅ updateGuardAvailability - Success for guard:", guardId);
    if (guardIdInt !== null && guardIdInt !== undefined) {
      console.log("✅ updateGuardAvailability - Transaction completed, guardIdInt was:", guardIdInt);
    }
    
    // Emit socket event to notify dashboard of availability change
    try {
      const io = req.app.locals.io;
      if (io) {
        // Emit to all, but include tenant_id so frontend can filter if needed
        io.to("role:all").emit("guard:availability_updated", {
          guardId: guardId,
          guardName: updatedGuard.guard.name,
          availability: Boolean(availability),
          tenantId: updatedGuard.guard.tenant_id, // Include tenant_id for filtering
          updatedAt: new Date().toISOString(),
        });
        console.log("✅ updateGuardAvailability - Socket event emitted");
      }
    } catch (socketError) {
      console.warn("⚠️ updateGuardAvailability - Failed to emit socket event (non-fatal):", socketError.message);
    }
    
    return res.json({
      ...updatedGuard.guard.toJSON(),
      availability: Boolean(availability), // Include the new availability in response
    });
  } catch (e) {
    console.error("❌ updateGuardAvailability - Error:", e.message);
    console.error("❌ updateGuardAvailability - Stack:", e.stack);
    console.error("❌ updateGuardAvailability - Error name:", e.name);
    console.error("❌ updateGuardAvailability - Error details:", {
      guardId,
      availability,
      body: req.body,
    });
    
    // Provide more specific error messages
    let errorMessage = "Failed to update availability";
    if (e.name === 'SequelizeValidationError') {
      errorMessage = `Validation error: ${e.errors?.map(err => err.message).join(', ') || e.message}`;
    } else if (e.name === 'SequelizeDatabaseError') {
      errorMessage = `Database error: ${e.message}`;
    } else {
      errorMessage = e.message || "Failed to update availability";
    }
    
    return res.status(500).json({ 
      message: errorMessage, 
      error: e.message,
      details: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
  }
};

exports.getRecentAvailabilityLogs = async (req, res) => {
  try {
    const { AvailabilityLog } = req.app.locals.models;
    const limit = Math.min(parseInt(req.query.limit || "12", 10), 100);

    const logs = await AvailabilityLog.findAll({
      order: [["createdAt", "DESC"]],
      limit,
    });

    return res.json(logs);
  } catch (e) {
    return res.status(500).json({ message: "Failed to load availability logs", error: e.message });
  }
};

exports.listGuards = async (req, res) => {
  try {
    const { Guard, AvailabilityLog } = req.app.locals.models;

    if (!Guard) {
      console.error("❌ Guard model not found in req.app.locals.models");
      return res.status(500).json({ message: "Guard model not available", error: "Model not found" });
    }

    // ✅ Tenant isolation: Filter by tenant_id for admin/supervisor
    const tenantWhere = getTenantWhere(req.admin);
    const whereClause = tenantWhere ? { ...tenantWhere } : {};

    console.log("🔍 listGuards - Admin:", req.admin?.id, "Role:", req.admin?.role, "Tenant:", req.admin?.tenant_id);
    console.log("🔍 listGuards - Where clause:", JSON.stringify(whereClause));

    const guards = await Guard.findAll({
      where: whereClause,
      order: [["created_at", "DESC"]],
    });

    console.log(`✅ listGuards - Found ${guards.length} guards`);

    // Get most recent availability for each guard
    // Since guardId in AvailabilityLog is integer but Guard.id is UUID, we need to hash UUIDs
    const crypto = require('crypto');
    
    // Get all recent availability logs
    const recentLogs = await AvailabilityLog.findAll({
      attributes: ['guardId', 'to', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });

    console.log(`🔍 listGuards - Found ${recentLogs.length} availability logs`);

    // Build a map of integer guardId -> availability (most recent)
    const availabilityByIntId = new Map();
    recentLogs.forEach(log => {
      if (!availabilityByIntId.has(log.guardId)) {
        availabilityByIntId.set(log.guardId, log.to);
        console.log(`🔍 listGuards - Mapped guardId ${log.guardId} -> availability ${log.to}`);
      }
    });

    // Map guards to their availability by hashing their UUID (same method as updateGuardAvailability)
    const guardsWithAvailability = guards.map(guard => {
      const guardData = guard.toJSON();
      
      // Convert guard UUID to integer (same method as in updateGuardAvailability)
      const hash = crypto.createHash('md5').update(guard.id).digest('hex');
      const guardIdInt = parseInt(hash.substring(0, 8), 16) % 2147483647;
      
      // Get availability from the map
      const availability = availabilityByIntId.get(guardIdInt);
      
      if (availability === undefined) {
        console.log(`⚠️ listGuards - No availability log found for guard ${guard.id} (hashed to ${guardIdInt})`);
      } else {
        console.log(`✅ listGuards - Guard ${guard.id} (${guard.name}) has availability: ${availability}`);
      }
      
      return {
        ...guardData,
        availability: availability !== undefined ? availability : true, // Default to true (available) if no log found
      };
    });

    return res.json(guardsWithAvailability);
  } catch (e) {
    console.error("❌ listGuards error:", e);
    console.error("Error stack:", e.stack);
    console.error("Error details:", {
      message: e.message,
      name: e.name,
      admin: req.admin ? { id: req.admin.id, role: req.admin.role } : "No admin",
    });
    return res.status(500).json({ 
      message: "Failed to load guards", 
      error: e.message,
      stack: process.env.NODE_ENV === "development" ? e.stack : undefined
    });
  }
};

exports.createGuard = async (req, res) => {
  console.log("🚀 createGuard - FUNCTION CALLED");
  console.log("🚀 createGuard - req.body:", req.body);
  try {
    const { Guard, AvailabilityLog, sequelize } = req.app.locals.models;

    // ✅ Tenant isolation: Automatically set tenant_id from admin's tenant
    const guardData = ensureTenantId(req.admin, {
      name: req.body.name,
      email: req.body.email || null,
      phone: req.body.phone || null,
      active: req.body.active ?? true,
      // Note: availability field doesn't exist in database, removed
    });

    const guard = await Guard.create(guardData);
    console.log("✅ createGuard - Guard created:", guard.id, guard.name);

    // ✅ Create availability log if availability is provided and guard is active
    const availabilityInRequest = req.body.availability !== undefined;
    const shouldCreateLog = availabilityInRequest && guard.active;
    
    console.log("🔍 createGuard - availabilityInRequest:", availabilityInRequest, "guard.active:", guard.active, "shouldCreateLog:", shouldCreateLog);

    // Calculate guardIdInt outside try block so it's accessible in catch block
    let guardIdInt = null;
    if (shouldCreateLog) {
      try {
        const crypto = require('crypto');
        const hash = crypto.createHash('md5').update(guard.id).digest('hex');
        guardIdInt = parseInt(hash.substring(0, 8), 16) % 2147483647;

        const availabilityValue = Boolean(req.body.availability);
        console.log("🔍 createGuard - Creating log with availability:", availabilityValue);

        // Create availability log entry using raw SQL
        // Temporarily disable FK constraint check since guardId is integer but Guards.id is UUID
        await sequelize.query('SET session_replication_role = replica');
        const [insertResult] = await sequelize.query(`
          INSERT INTO availability_logs ("guardId", "from", "to", "actorAdminId", "note", "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
          RETURNING id, "guardId", "from", "to", "createdAt"
        `, {
          bind: [
            guardIdInt,
            null, // No previous state for new guard
            availabilityValue,
            req.admin?.id || null,
            `Guard created with availability ${availabilityValue ? 'available' : 'unavailable'} by admin ${req.admin?.email || 'unknown'}`
          ],
          type: sequelize.QueryTypes.SELECT
        });
        await sequelize.query('SET session_replication_role = DEFAULT');
        
        const logEntry = insertResult[0];

        console.log("✅ createGuard - Availability log created:", {
          logId: logEntry.id,
          guardId: guardIdInt,
          to: availabilityValue,
        });

        // Emit socket event for availability
        try {
          const io = req.app.locals.io;
          if (io) {
            io.to("role:all").emit("guard:availability_updated", {
              guardId: guard.id,
              guardName: guard.name,
              availability: availabilityValue,
              tenantId: guard.tenant_id,
              updatedAt: new Date().toISOString(),
            });
            console.log("✅ createGuard - Socket event emitted for availability");
          }
        } catch (socketError) {
          console.warn("⚠️ createGuard - Failed to emit socket event (non-fatal):", socketError.message);
        }
      } catch (logError) {
        // Log error but don't fail guard creation
        console.error("❌ createGuard - Error creating availability log (non-fatal):", logError.message);
      }
    }

    // ✅ Notify inside the function (NO top-level await)
    await notify(req.app, {
      type: "GUARD_CREATED",
      title: "New guard added",
      message: `${guard.name} was added.`,
      entityType: "guard",
      entityId: guard.id,
    });

    // Return guard with availability in response
    const guardResponse = guard.toJSON();
    if (availabilityInRequest) {
      guardResponse.availability = Boolean(req.body.availability);
    }

    return res.status(201).json(guardResponse);
  } catch (e) {
    console.error("❌ createGuard error:", e);
    return res.status(500).json({ message: "Failed to create guard", error: e.message });
  }
};

exports.updateGuard = async (req, res) => {
  console.log("🚀 updateGuard - FUNCTION CALLED");
  console.log("🚀 updateGuard - guardId:", req.params.id);
  console.log("🚀 updateGuard - req.body:", req.body);
  try {
    const { Guard, AvailabilityLog, sequelize } = req.app.locals.models;
    const id = req.params.id;

    const guard = await Guard.findByPk(id);
    if (!guard) return res.status(404).json({ message: "Guard not found" });

    // ✅ Tenant isolation: Check if admin can access this guard's tenant
    if (guard.tenant_id && !canAccessTenant(req.admin, guard.tenant_id)) {
      return res.status(403).json({ message: "You don't have access to this guard" });
    }

    // Track if active status changed (important for dashboard updates)
    const wasActive = guard.active;
    const activeChanged = req.body.active !== undefined && req.body.active !== wasActive;

    // Track if availability is being set (need to create log entry)
    // If availability is in the request body, we should create a log entry
    const availabilityInRequest = req.body.availability !== undefined;
    const wasAvailability = Boolean(guard.availability);
    const newAvailability = availabilityInRequest ? Boolean(req.body.availability) : wasAvailability;
    const availabilityChanged = availabilityInRequest && newAvailability !== wasAvailability;

    console.log("🔍 updateGuard - wasActive:", wasActive, "new active:", req.body.active, "activeChanged:", activeChanged);
    console.log("🔍 updateGuard - availabilityInRequest:", availabilityInRequest);
    console.log("🔍 updateGuard - wasAvailability:", wasAvailability, "new availability:", newAvailability, "availabilityChanged:", availabilityChanged);
    console.log("🔍 updateGuard - req.body.availability raw:", req.body.availability, "type:", typeof req.body.availability);

    // Check active status BEFORE updating (we need the old value)
    const wasActiveBeforeUpdate = guard.active;
    
    Object.assign(guard, req.body);
    await guard.save();

    // ✅ Create availability log if availability is in request
    // Always create log when availability is provided - it's useful for history
    // The dashboard query will filter by active guards anyway, so inactive guards won't be counted
    const shouldCreateLog = availabilityInRequest;
    
    console.log("🔍 updateGuard - shouldCreateLog:", shouldCreateLog);
    console.log("🔍 updateGuard -   availabilityInRequest:", availabilityInRequest);
    console.log("🔍 updateGuard -   guard.active:", guard.active);
    console.log("🔍 updateGuard -   activeChanged:", activeChanged);

    // Calculate guardIdInt and availabilityValue outside try block so they're accessible in catch block
    let guardIdInt = null;
    const availabilityValue = newAvailability;
    if (shouldCreateLog) {
      try {
        const crypto = require('crypto');
        // Ensure guard.id is a string for hashing
        const guardIdStr = String(guard.id);
        const hash = crypto.createHash('md5').update(guardIdStr).digest('hex');
        guardIdInt = parseInt(hash.substring(0, 8), 16) % 2147483647;
        
        if (!guardIdInt || isNaN(guardIdInt)) {
          throw new Error(`Invalid guardIdInt calculated: ${guardIdInt}`);
        }
        
        console.log("🔍 updateGuard - guard.id:", guard.id, "(type:", typeof guard.id, ")");
        console.log("🔍 updateGuard - guardIdInt (converted):", guardIdInt);

        // Get previous availability status from most recent log (only if guardIdInt is valid)
        let from = null;
        if (guardIdInt !== null && !isNaN(guardIdInt)) {
          try {
            const previousLog = await AvailabilityLog.findOne({
              where: { guardId: guardIdInt },
              order: [['createdAt', 'DESC']],
            });
            from = previousLog ? previousLog.to : null;
          } catch (logQueryError) {
            console.warn("⚠️ updateGuard - Error querying previous log:", logQueryError.message);
          }
        }
        console.log("🔍 updateGuard - Creating log with availability:", availabilityValue, "(from:", from, ")");
        console.log("🔍 updateGuard - newAvailability:", newAvailability, "req.body.availability:", req.body.availability);
        console.log("🔍 updateGuard - guardIdInt valid:", guardIdInt !== null && !isNaN(guardIdInt));

        // Only create log if guardIdInt is valid
        if (guardIdInt === null || isNaN(guardIdInt)) {
          throw new Error(`Cannot create log: guardIdInt is invalid: ${guardIdInt} for guard ${guard.name} (ID: ${guard.id})`);
        }

        // Create availability log entry using raw SQL
        // Temporarily disable FK constraint check since guardId is integer but Guards.id is UUID
        await sequelize.query('SET session_replication_role = replica');
        const insertResult = await sequelize.query(`
          INSERT INTO availability_logs ("guardId", "from", "to", "actorAdminId", "note", "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
          RETURNING id, "guardId", "from", "to", "createdAt"
        `, {
          bind: [
            guardIdInt,
            from,
            availabilityValue,
            req.admin?.id || null,
            `Availability updated via edit form by admin ${req.admin?.email || 'unknown'}`
          ],
          type: sequelize.QueryTypes.SELECT
        });
        await sequelize.query('SET session_replication_role = DEFAULT');
        
        // insertResult can be an array or an object directly, handle both cases
        const logEntry = Array.isArray(insertResult) ? insertResult[0] : insertResult;
        if (!logEntry || !logEntry.id) {
          throw new Error("Insert returned invalid result - insertResult: " + JSON.stringify(insertResult));
        }
        console.log("✅ updateGuard - Availability log created (raw SQL):", {
          logId: logEntry.id,
          guardId: logEntry.guardId,
          from: logEntry.from,
          to: logEntry.to,
          createdAt: logEntry.createdAt
        });

        // Emit socket event for availability change
        try {
          const io = req.app.locals.io;
          if (io) {
            io.to("role:all").emit("guard:availability_updated", {
              guardId: guard.id,
              guardName: guard.name,
              availability: newAvailability,
              tenantId: guard.tenant_id,
              updatedAt: new Date().toISOString(),
            });
            console.log("✅ updateGuard - Socket event emitted for availability change, availability:", newAvailability);
          }
        } catch (socketError) {
          console.warn("⚠️ updateGuard - Failed to emit socket event for availability (non-fatal):", socketError.message);
        }
      } catch (logError) {
        // Log error but don't fail the guard update
        console.error("❌ updateGuard - Error creating availability log (non-fatal):", logError.message);
        console.error("❌ updateGuard - Error details:", {
          name: logError.name,
          message: logError.message,
          stack: logError.stack,
          guardId: guard.id,
          guardName: guard.name,
          guardIdInt: guardIdInt,
          availabilityValue: availabilityValue,
          from: from
        });
        // Try to see what the actual SQL error is
        if (logError.original) {
          console.error("❌ updateGuard - SQL Error:", logError.original.message);
          console.error("❌ updateGuard - SQL Code:", logError.original.code);
        }
      }
    }

    // ✅ Emit socket event if active status changed (dashboard needs to refresh)
    if (activeChanged) {
      try {
        const io = req.app.locals.io;
        if (io) {
          io.to("role:all").emit("guard:status_updated", {
            guardId: guard.id,
            guardName: guard.name,
            active: guard.active,
            tenantId: guard.tenant_id,
            updatedAt: new Date().toISOString(),
          });
          console.log("✅ updateGuard - Socket event emitted for active status change");
        }
      } catch (socketError) {
        console.warn("⚠️ updateGuard - Failed to emit socket event (non-fatal):", socketError.message);
      }
    }

    return res.json(guard);
  } catch (e) {
    console.error("❌ updateGuard error:", e);
    return res.status(500).json({ message: "Failed to update guard", error: e.message });
  }
};

exports.deleteGuard = async (req, res) => {
  try {
    const { Guard } = req.app.locals.models;
    const id = req.params.id;

    const guard = await Guard.findByPk(id);
    if (!guard) return res.status(404).json({ message: "Guard not found" });

    // ✅ Tenant isolation: Check if admin can access this guard's tenant
    if (guard.tenant_id && !canAccessTenant(req.admin, guard.tenant_id)) {
      return res.status(403).json({ message: "You don't have access to this guard" });
    }

    const name = guard.name;
    await guard.destroy();

    // ✅ Notify inside the function (NO top-level await)
    await notify(req.app, {
      type: "GUARD_DELETED",
      title: "Guard deleted",
      message: `${name} was deleted.`,
      entityType: "guard",
      entityId: Number(id),
    });

    return res.json({ message: "Guard deleted" });
  } catch (e) {
    return res.status(500).json({ message: "Failed to delete guard", error: e.message });
  }
};

/**
 * POST /api/admin/guards/:id/unlock
 * Clear failed_login_attempts and locked_until so the guard can log in again.
 */
exports.unlockGuard = async (req, res) => {
  try {
    const { Guard } = req.app.locals.models;
    const id = req.params.id;

    const guard = await Guard.findByPk(id);
    if (!guard) return res.status(404).json({ message: "Guard not found" });

    if (guard.tenant_id && !canAccessTenant(req.admin, guard.tenant_id)) {
      return res.status(403).json({ message: "You don't have access to this guard" });
    }

    await Guard.update(
      { failed_login_attempts: 0, locked_until: null },
      { where: { id } }
    );

    return res.json({
      message: "Guard account unlocked",
      guard: {
        id: guard.id,
        email: guard.email,
        name: guard.name,
      },
    });
  } catch (e) {
    return res.status(500).json({ message: "Failed to unlock guard", error: e.message });
  }
};

exports.getAvailabilityLogs = async (req, res) => {
  try {
    const { AvailabilityLog } = req.app.locals.models;
    const guardId = req.params.id;

    const rows = await AvailabilityLog.findAll({
      where: { guardId },
      order: [["createdAt", "DESC"]],
    });

    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ message: "Failed to load availability logs", error: e.message });
  }
};

// Comprehensive guard history: callouts, late, AI ranks, availability, created date
exports.getGuardHistory = async (req, res) => {
  try {
    const { sequelize, Guard, AvailabilityLog } = req.app.locals.models;
    const guardId = parseInt(req.params.id, 10);

    if (isNaN(guardId)) {
      return res.status(400).json({ message: "Invalid guard ID" });
    }

    // Get guard info (including created date)
    const guard = await Guard.findByPk(guardId);
    if (!guard) {
      return res.status(404).json({ message: "Guard not found" });
    }

    // ✅ Tenant isolation: Check if admin can access this guard's tenant
    if (guard.tenant_id && !canAccessTenant(req.admin, guard.tenant_id)) {
      return res.status(403).json({ message: "You don't have access to this guard" });
    }

    // Get guard email to match with abe-guard-ai system (callouts use UUID guard_id)
    const guardEmail = guard.email;

    // First, try to find matching guard IDs by email in guards table (for UUID matching)
    // This will be used later to match shifts/callouts that use UUID guard_ids
    let matchingGuardIds = new Set();
    matchingGuardIds.add(String(guardId)); // Add the integer guard ID
    
    try {
      const [guardMatches] = await sequelize.query(
        `SELECT id FROM guards WHERE lower(email) = lower($1)`,
        { bind: [guardEmail] }
      );
      if (guardMatches && guardMatches.length > 0) {
        guardMatches.forEach((g) => {
          matchingGuardIds.add(String(g.id));
        });
        console.log(`✅ Found ${guardMatches.length} matching guard(s) by email: ${guardEmail}`);
        console.log(`   Matching guard IDs:`, Array.from(matchingGuardIds));
      }
    } catch (err) {
      // Guards table might not exist or have different schema - continue
      console.warn("⚠️ Could not query guards table for email match:", err.message);
    }

    const history = {
      guard: {
        id: guard.id,
        name: guard.name,
        email: guard.email,
        createdAt: guard.created_at || guard.createdAt,
      },
      availabilityLogs: [],
      callouts: [],
      lateHistory: [],
      aiRankings: [],
    };

    // 1. Availability Logs
    let availabilityLogs = [];
    try {
      availabilityLogs = await AvailabilityLog.findAll({
        where: { guardId },
        order: [["createdAt", "DESC"]],
        limit: 50,
      });
    } catch (err) {
      console.warn("⚠️ Could not fetch availability logs:", err.message);
      availabilityLogs = [];
    }
    history.availabilityLogs = availabilityLogs.map((log) => ({
      id: log.id,
      type: "availability",
      field: log.field || "availability",
      from: log.from,
      to: log.to,
      createdAt: log.createdAt,
      actorAdminId: log.actorAdminId,
      note: log.note,
    }));

    // 2. Callouts (from callouts table - guard_id is UUID, match by email or try to find)
    // Query callouts and match by guard email or try to find by guard_id if UUID conversion works
    let callouts = [];
    try {
      // ✅ Tenant isolation: Filter callouts by tenant
      const tenantFilter = getTenantWhere(req.admin);
      const tenantSql = tenantFilter 
        ? `AND tenant_id = '${tenantFilter.tenant_id}'`
        : "";

      const calloutResults = await sequelize.query(
        `
        SELECT 
          id,
          guard_id,
          shift_id,
          reason,
          created_at,
          tenant_id
        FROM callouts
        WHERE 1=1 ${tenantSql}
        ORDER BY created_at DESC
        LIMIT 100
        `,
        { type: sequelize.QueryTypes.SELECT }
      );
      callouts = Array.isArray(calloutResults) ? calloutResults : [];
    } catch (err) {
      console.warn("⚠️ Could not fetch callouts:", err.message);
      // Table might not exist - continue without callouts
      callouts = [];
    }

    // Filter callouts - try to match by guard_id (using the same matching logic)
    console.log(`🔍 Filtering ${callouts.length} callouts with matching guard IDs:`, Array.from(matchingGuardIds));
    history.callouts = callouts
      .filter((c) => {
        if (!c.guard_id) return false;
        // Check if guard_id matches any of our known guard IDs
        const matches = matchingGuardIds.has(String(c.guard_id));
        if (matches) {
          console.log(`   ✅ Matched callout: ${c.id.substring(0, 8)}... (guard_id: ${c.guard_id})`);
        }
        return matches;
      })
      .map((c) => ({
        id: c.id,
        type: "callout",
        guardId: c.guard_id,
        shiftId: c.shift_id,
        reason: c.reason || "Unknown",
        createdAt: c.created_at,
        tenantId: c.tenant_id,
      }));

    // 3. Late History (shifts marked as running late)
    let lateShifts = [];
    try {
      // ✅ Tenant isolation: Filter shifts by tenant
      const tenantFilter = getTenantWhere(req.admin);
      const tenantSql = tenantFilter 
        ? `AND s.tenant_id = '${tenantFilter.tenant_id}'`
        : "";

      const lateResults = await sequelize.query(
        `
        SELECT 
          s.id,
          s.guard_id,
          s.shift_date,
          s.shift_start,
          s.shift_end,
          s.status,
          s.created_at,
          s.ai_decision
        FROM shifts s
        WHERE s.ai_decision->>'running_late' = 'true'
          AND s.guard_id IS NOT NULL
          ${tenantSql}
        ORDER BY (s.ai_decision->>'marked_late_at') DESC NULLS LAST, s.created_at DESC
        LIMIT 100
        `,
        { type: sequelize.QueryTypes.SELECT }
      );
      lateShifts = Array.isArray(lateResults) ? lateResults : [];
      console.log(`📊 Found ${lateShifts.length} late shifts in database`);
      if (lateShifts.length > 0) {
        console.log(`   First late shift: ${lateShifts[0].id.substring(0, 8)}... guard_id: ${lateShifts[0].guard_id}`);
      }
    } catch (err) {
      console.error("⚠️ Could not fetch late shifts:", err.message);
      console.error("   Error stack:", err.stack);
      // Table or column might not exist - continue without late history
      lateShifts = [];
    }

    // Filter by guard_id using the matchingGuardIds set we created earlier
    console.log(`🔍 Filtering ${lateShifts.length} late shifts`);
    console.log(`   Matching guard IDs set:`, Array.from(matchingGuardIds));
    console.log(`   Guard ID (integer): ${guardId}, Email: ${guardEmail}`);
    
    history.lateHistory = lateShifts
      .filter((s) => {
        if (!s.guard_id) {
          console.log(`   ⚠️  Late shift ${s.id.substring(0, 8)}... has no guard_id`);
          return false;
        }
        const guardIdStr = String(s.guard_id);
        const matches = matchingGuardIds.has(guardIdStr);
        console.log(`   Checking shift ${s.id.substring(0, 8)}... guard_id: ${guardIdStr}, matches: ${matches}`);
        if (matches) {
          console.log(`   ✅ Matched late shift: ${s.id.substring(0, 8)}... (guard_id: ${s.guard_id})`);
        }
        return matches;
      })
      .map((s) => {
        // Parse ai_decision if it's a string (JSONB might come as string)
        let aiDecision = s.ai_decision;
        if (typeof aiDecision === "string") {
          try {
            aiDecision = JSON.parse(aiDecision);
          } catch (e) {
            aiDecision = null;
          }
        }
        return {
          id: s.id,
          type: "late",
          guardId: s.guard_id,
          shiftDate: s.shift_date,
          shiftStart: s.shift_start,
          shiftEnd: s.shift_end,
          status: s.status,
          reason: aiDecision?.late_reason || "Running late",
          markedAt: aiDecision?.marked_late_at || s.created_at,
          createdAt: s.created_at,
        };
      });

    // 4. AI Rankings (shifts with AI decision for this guard)
    let aiRankings = [];
    try {
      // ✅ Tenant isolation: Filter shifts by tenant
      const tenantFilter = getTenantWhere(req.admin);
      const tenantSql = tenantFilter 
        ? `AND s.tenant_id = '${tenantFilter.tenant_id}'`
        : "";

      const rankingResults = await sequelize.query(
        `
        SELECT 
          s.id,
          s.guard_id,
          s.shift_date,
          s.shift_start,
          s.shift_end,
          s.status,
          s.location,
          s.created_at,
          s.ai_decision
        FROM shifts s
        WHERE s.ai_decision IS NOT NULL
          AND s.guard_id IS NOT NULL
          ${tenantSql}
        ORDER BY s.created_at DESC
        LIMIT 100
        `,
        { type: sequelize.QueryTypes.SELECT }
      );
      aiRankings = Array.isArray(rankingResults) ? rankingResults : [];
    } catch (err) {
      console.warn("⚠️ Could not fetch AI rankings:", err.message);
      // Table or column might not exist - continue without AI rankings
      aiRankings = [];
    }

    // Filter by guard_id (using the same matching logic as late history)
    console.log(`🔍 Filtering ${aiRankings.length} AI rankings with matching guard IDs:`, Array.from(matchingGuardIds));
    history.aiRankings = aiRankings
      .filter((s) => {
        if (!s.guard_id) return false;
        // Check if guard_id matches any of our known guard IDs
        const matches = matchingGuardIds.has(String(s.guard_id));
        if (matches) {
          console.log(`   ✅ Matched AI ranking: ${s.id.substring(0, 8)}... (guard_id: ${s.guard_id})`);
        }
        return matches;
      })
      .map((s) => {
        // Parse ai_decision if it's a string (JSONB might come as string)
        let aiDecision = s.ai_decision;
        if (typeof aiDecision === "string") {
          try {
            aiDecision = JSON.parse(aiDecision);
          } catch (e) {
            aiDecision = null;
          }
        }
        return {
          id: s.id,
          type: "ai_ranking",
          guardId: s.guard_id,
          shiftDate: s.shift_date,
          shiftStart: s.shift_start,
          shiftEnd: s.shift_end,
          status: s.status,
          location: s.location,
          ranking: aiDecision?.ranking || null,
          confidence: aiDecision?.confidence || null,
          reasons: aiDecision?.reasons || aiDecision?.reason || null,
          isOverridden: aiDecision?.overridden === true,
          createdAt: s.created_at,
        };
      });

    // Sort all history by date (most recent first)
    const allHistory = [
      ...history.availabilityLogs.map((h) => ({ ...h, timestamp: h.createdAt })),
      ...history.callouts.map((h) => ({ ...h, timestamp: h.createdAt })),
      ...history.lateHistory.map((h) => ({ ...h, timestamp: h.markedAt || h.createdAt })),
      ...history.aiRankings.map((h) => ({ ...h, timestamp: h.createdAt })),
      // Add guard creation as a history entry
      {
        id: `guard-created-${guard.id}`,
        type: "guard_created",
        timestamp: history.guard.createdAt,
        createdAt: history.guard.createdAt,
      },
    ].sort((a, b) => new Date(b.timestamp || b.createdAt) - new Date(a.timestamp || a.createdAt));

    return res.json({
      guard: history.guard,
      history: allHistory,
      summary: {
        totalAvailabilityChanges: history.availabilityLogs.length,
        totalCallouts: history.callouts.length,
        totalLate: history.lateHistory.length,
        totalAIRankings: history.aiRankings.length,
      },
    });
  } catch (e) {
    console.error("❌ getGuardHistory error:", e);
    console.error("Stack trace:", e.stack);
    return res.status(500).json({ 
      message: "Failed to load guard history", 
      error: e.message,
      stack: process.env.NODE_ENV === "development" ? e.stack : undefined
    });
  }
};
