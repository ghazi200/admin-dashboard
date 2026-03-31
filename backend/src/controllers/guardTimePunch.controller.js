/**
 * Guard time punch (clock in/out, break) for guard-ui.
 * POST /shifts/:shiftId/* — same paths as abe-guard-ai; uses public.time_entries (raw SQL).
 */
function getIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null
  );
}

async function loadShiftRow(sequelize, shiftId, guardTenantId) {
  let sql = `SELECT id, guard_id, status, tenant_id FROM public.shifts WHERE id = $1::uuid`;
  const bind = [shiftId];
  if (guardTenantId) {
    bind.push(guardTenantId);
    sql += ` AND tenant_id = $2::uuid`;
  }
  const [rows] = await sequelize.query(`${sql} LIMIT 1`, { bind });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

function shiftAccess(shift, guardId) {
  const gid = String(guardId);
  const sg = shift.guard_id != null ? String(shift.guard_id) : null;
  const st = String(shift.status || "").toUpperCase();
  const assigned = sg && sg === gid;
  const openUnassigned = st === "OPEN" && !sg;
  return { assigned, openUnassigned, canSee: st === "OPEN" || assigned };
}

async function getLatestTimeEntry(sequelize, shiftId, guardId) {
  const [rows] = await sequelize.query(
    `SELECT id, shift_id, guard_id, clock_in_at, clock_out_at, lunch_start_at, lunch_end_at
     FROM public.time_entries
     WHERE shift_id = $1::uuid AND guard_id = $2::uuid
     ORDER BY created_at DESC NULLS LAST
     LIMIT 1`,
    { bind: [shiftId, guardId] }
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function tryOptionalTimeEntryExtras(sequelize, timeEntryId, body, phase) {
  const lat = body?.lat;
  const lng = body?.lng;
  const acc = body?.accuracyM ?? body?.accuracy_m;
  const deviceType = body?.deviceType || null;
  const deviceOS = body?.deviceOS || null;
  const deviceId = body?.deviceId || null;
  const ip = null;
  if (phase === "in" && lat == null && lng == null && !deviceType && !deviceId) return;
  if (phase === "out" && lat == null && lng == null) return;

  const sets = [];
  const bind = [];
  let i = 1;
  if (phase === "in") {
    if (lat != null) {
      sets.push(`clock_in_lat = $${i++}`);
      bind.push(lat);
    }
    if (lng != null) {
      sets.push(`clock_in_lng = $${i++}`);
      bind.push(lng);
    }
    if (acc != null) {
      sets.push(`clock_in_accuracy_m = $${i++}`);
      bind.push(acc);
    }
    if (deviceType) {
      sets.push(`device_type = $${i++}`);
      bind.push(deviceType);
    }
    if (deviceOS) {
      sets.push(`device_os = $${i++}`);
      bind.push(deviceOS);
    }
    if (deviceId) {
      sets.push(`device_id = $${i++}`);
      bind.push(deviceId);
    }
  } else {
    if (lat != null) {
      sets.push(`clock_out_lat = $${i++}`);
      bind.push(lat);
    }
    if (lng != null) {
      sets.push(`clock_out_lng = $${i++}`);
      bind.push(lng);
    }
    if (acc != null) {
      sets.push(`clock_out_accuracy_m = $${i++}`);
      bind.push(acc);
    }
  }
  if (!sets.length) return;
  bind.push(timeEntryId);
  const sql = `UPDATE public.time_entries SET ${sets.join(", ")} WHERE id = $${i}::uuid`;
  try {
    await sequelize.query(sql, { bind });
  } catch (_) {
    /* optional columns may be missing on older DBs */
  }
}

async function fetchFullTimeEntry(sequelize, id) {
  const [rows] = await sequelize.query(
    `SELECT id, shift_id, guard_id, clock_in_at, clock_out_at, lunch_start_at, lunch_end_at
     FROM public.time_entries WHERE id = $1::uuid LIMIT 1`,
    { bind: [id] }
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

exports.clockIn = async (req, res) => {
  try {
    const guardId = req.guard?.id;
    if (!guardId) return res.status(401).json({ message: "Missing guard identity (auth)" });

    const { shiftId } = req.params;
    const sequelize = req.app.locals.models?.sequelize;
    if (!sequelize) return res.status(500).json({ message: "Database not available" });

    const shift = await loadShiftRow(sequelize, shiftId, req.guard?.tenant_id || null);
    if (!shift) return res.status(404).json({ message: "Shift not found" });

    const { assigned, openUnassigned } = shiftAccess(shift, guardId);
    if (!assigned && !openUnassigned) {
      return res.status(403).json({ message: "Guard is not assigned to this shift" });
    }

    if (openUnassigned) {
      await sequelize.query(
        `UPDATE public.shifts SET guard_id = $1::uuid, status = 'CLOSED' WHERE id = $2::uuid`,
        { bind: [guardId, shift.id] }
      );
    }

    const existing = await getLatestTimeEntry(sequelize, shift.id, guardId);
    if (existing?.clock_in_at) {
      const out = existing.clock_out_at;
      const inn = existing.clock_in_at;
      const isOut =
        out && inn && new Date(out) >= new Date(inn);
      if (!isOut) {
        return res.status(400).json({ message: "Already clocked in for this shift." });
      }
    }

    let teId;

    if (existing?.id) {
      await sequelize.query(
        `UPDATE public.time_entries
         SET clock_in_at = NOW(), clock_out_at = NULL,
             lunch_start_at = NULL, lunch_end_at = NULL
         WHERE id = $1::uuid`,
        { bind: [existing.id] }
      );
      teId = existing.id;
    } else {
      const tenantId = shift.tenant_id || req.guard?.tenant_id || null;
      try {
        const [ins] = await sequelize.query(
          `INSERT INTO public.time_entries (id, shift_id, guard_id, tenant_id, clock_in_at, created_at)
           VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, NOW(), NOW())
           RETURNING id`,
          { bind: [shift.id, guardId, tenantId] }
        );
        teId = ins[0]?.id;
      } catch (e) {
        const [ins2] = await sequelize.query(
          `INSERT INTO public.time_entries (id, shift_id, guard_id, clock_in_at, created_at)
           VALUES (gen_random_uuid(), $1::uuid, $2::uuid, NOW(), NOW())
           RETURNING id`,
          { bind: [shift.id, guardId] }
        );
        teId = ins2[0]?.id;
      }
    }

    await tryOptionalTimeEntryExtras(sequelize, teId, req.body, "in");

    const ip = getIp(req);
    if (ip) {
      try {
        await sequelize.query(`UPDATE public.time_entries SET ip_address = $1 WHERE id = $2::uuid`, {
          bind: [ip, teId],
        });
      } catch (_) {}
    }

    const teRow = await fetchFullTimeEntry(sequelize, teId);
    return res.json({ ok: true, timeEntry: teRow });
  } catch (e) {
    console.error("guardTimePunch.clockIn:", e);
    return res.status(500).json({ message: "Server error", error: String(e.message || e) });
  }
};

exports.clockOut = async (req, res) => {
  try {
    const guardId = req.guard?.id;
    if (!guardId) return res.status(401).json({ message: "Missing guard identity (auth)" });

    const { shiftId } = req.params;
    const sequelize = req.app.locals.models?.sequelize;
    if (!sequelize) return res.status(500).json({ message: "Database not available" });

    const shift = await loadShiftRow(sequelize, shiftId, req.guard?.tenant_id || null);
    if (!shift) return res.status(404).json({ message: "Shift not found" });

    const { assigned } = shiftAccess(shift, guardId);
    const te = await getLatestTimeEntry(sequelize, shift.id, guardId);

    if (!assigned && !te?.clock_in_at) {
      return res.status(403).json({ message: "Guard is not assigned to this shift" });
    }
    if (!te?.clock_in_at) {
      return res.status(400).json({ message: "Cannot clock out before clocking in." });
    }
    const isCurrentlyClockedOut =
      te.clock_out_at &&
      te.clock_in_at &&
      new Date(te.clock_out_at) >= new Date(te.clock_in_at);
    if (isCurrentlyClockedOut) {
      return res.status(400).json({ message: "Already clocked out for this shift." });
    }

    await sequelize.query(
      `UPDATE public.time_entries SET clock_out_at = NOW() WHERE id = $1::uuid`,
      { bind: [te.id] }
    );
    await tryOptionalTimeEntryExtras(sequelize, te.id, req.body, "out");

    const teRow = await fetchFullTimeEntry(sequelize, te.id);
    return res.json({ ok: true, timeEntry: teRow });
  } catch (e) {
    console.error("guardTimePunch.clockOut:", e);
    return res.status(500).json({ message: "Server error", error: String(e.message || e) });
  }
};

exports.breakStart = async (req, res) => {
  try {
    const guardId = req.guard?.id;
    if (!guardId) return res.status(401).json({ message: "Missing guard identity (auth)" });

    const { shiftId } = req.params;
    const sequelize = req.app.locals.models?.sequelize;
    if (!sequelize) return res.status(500).json({ message: "Database not available" });

    const shift = await loadShiftRow(sequelize, shiftId, req.guard?.tenant_id || null);
    if (!shift) return res.status(404).json({ message: "Shift not found" });

    const { assigned } = shiftAccess(shift, guardId);
    const te = await getLatestTimeEntry(sequelize, shift.id, guardId);

    if (!assigned && !te?.clock_in_at) {
      return res.status(403).json({ message: "Guard is not assigned to this shift" });
    }
    if (!te?.clock_in_at) {
      return res.status(400).json({ message: "Cannot start break before clocking in." });
    }
    const isCurrentlyClockedOut =
      te.clock_out_at &&
      te.clock_in_at &&
      new Date(te.clock_out_at) >= new Date(te.clock_in_at);
    if (isCurrentlyClockedOut) {
      return res.status(400).json({ message: "Cannot start break after clocking out." });
    }
    if (te.lunch_start_at && !te.lunch_end_at) {
      return res.status(400).json({ message: "Break already started." });
    }

    await sequelize.query(
      `UPDATE public.time_entries SET lunch_start_at = NOW(), lunch_end_at = NULL WHERE id = $1::uuid`,
      { bind: [te.id] }
    );
    const teRow = await fetchFullTimeEntry(sequelize, te.id);
    return res.json({ ok: true, timeEntry: teRow });
  } catch (e) {
    console.error("guardTimePunch.breakStart:", e);
    return res.status(500).json({ message: "Server error", error: String(e.message || e) });
  }
};

exports.breakEnd = async (req, res) => {
  try {
    const guardId = req.guard?.id;
    if (!guardId) return res.status(401).json({ message: "Missing guard identity (auth)" });

    const { shiftId } = req.params;
    const sequelize = req.app.locals.models?.sequelize;
    if (!sequelize) return res.status(500).json({ message: "Database not available" });

    const shift = await loadShiftRow(sequelize, shiftId, req.guard?.tenant_id || null);
    if (!shift) return res.status(404).json({ message: "Shift not found" });

    const { assigned } = shiftAccess(shift, guardId);
    const te = await getLatestTimeEntry(sequelize, shift.id, guardId);

    if (!assigned && !te?.clock_in_at) {
      return res.status(403).json({ message: "Guard is not assigned to this shift" });
    }
    if (!te?.clock_in_at) {
      return res.status(400).json({ message: "Cannot end break before clocking in." });
    }
    const isCurrentlyClockedOut =
      te.clock_out_at &&
      te.clock_in_at &&
      new Date(te.clock_out_at) >= new Date(te.clock_in_at);
    if (isCurrentlyClockedOut) {
      return res.status(400).json({ message: "Cannot end break after clocking out." });
    }
    if (!te.lunch_start_at) {
      return res.status(400).json({ message: "Cannot end break before starting it." });
    }
    if (te.lunch_end_at) {
      return res.status(400).json({ message: "Break already ended." });
    }

    await sequelize.query(
      `UPDATE public.time_entries SET lunch_end_at = NOW() WHERE id = $1::uuid`,
      { bind: [te.id] }
    );
    const teRow = await fetchFullTimeEntry(sequelize, te.id);
    return res.json({ ok: true, timeEntry: teRow });
  } catch (e) {
    console.error("guardTimePunch.breakEnd:", e);
    return res.status(500).json({ message: "Server error", error: String(e.message || e) });
  }
};
