/**
 * Late clock-in admin alerts.
 *
 * After a grace period (default 15 min), if an assigned guard has not clocked in,
 * notify admins once (notification + socket + Command Center OpEvent + optional SMS).
 *
 * Env:
 *   LATE_CLOCKIN_GRACE_MINUTES=15
 *   LATE_CLOCKIN_MAX_HOURS=12
 *   LATE_CLOCKIN_TZ=America/New_York
 *   LATE_CLOCKIN_INTERVAL_MS=60000
 *   LATE_CLOCKIN_SMS=1          (set 0 to disable SMS)
 *   LATE_CLOCKIN_NOTIFY_PHONE   (falls back to SOS_NOTIFY_PHONE)
 */

const logger = require("../../logger");
const { notify } = require("../utils/notify");
const {
  getDefaultWeeklyTemplate,
  dateInTimeZone,
  weekdayInTimeZone,
  findGuardByName,
} = require("../utils/weeklySchedule");

function envInt(name, fallback) {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) ? n : fallback;
}

function graceMinutes() {
  return Math.max(1, envInt("LATE_CLOCKIN_GRACE_MINUTES", 15));
}

function maxHours() {
  return Math.max(1, envInt("LATE_CLOCKIN_MAX_HOURS", 12));
}

function tz() {
  return process.env.LATE_CLOCKIN_TZ || "America/New_York";
}

function smsEnabled() {
  const v = String(process.env.LATE_CLOCKIN_SMS ?? "1").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

function toE164(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return null;
  if (raw.startsWith("+")) return raw.replace(/\s/g, "");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

async function sendLateClockInSms({ guardName, locationLabel, minsLate, shiftStart }) {
  if (!smsEnabled()) return { sent: false, reason: "sms_disabled" };
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER;
  const messagingServiceSid =
    process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_MESSAGE_SERVICE_SID;
  const to = toE164(
    process.env.LATE_CLOCKIN_NOTIFY_PHONE ||
      process.env.SOS_NOTIFY_PHONE ||
      process.env.SOS_SUPERVISOR_PHONE ||
      process.env.SOS_ADMIN_PHONE
  );
  if (!accountSid || !authToken) return { sent: false, reason: "twilio_not_configured" };
  if (!from && !messagingServiceSid) return { sent: false, reason: "missing_from" };
  if (!to) return { sent: false, reason: "no_phone" };

  const loc = locationLabel ? ` at ${locationLabel}` : "";
  const body = `ABE Guard: ${guardName || "A guard"} has not clocked in${loc}. ${minsLate} min late (shift ${shiftStart || ""}). Check the admin dashboard.`;

  try {
    const twilio = require("twilio");
    const client = twilio(accountSid, authToken);
    const payload = messagingServiceSid
      ? { body, to, messagingServiceSid }
      : { body, to, from };
    const msg = await client.messages.create(payload);
    logger.info({ sid: msg.sid, to }, "lateClockIn SMS sent");
    return { sent: true, to, sid: msg.sid };
  } catch (e) {
    logger.warn({ err: e?.message }, "lateClockIn SMS failed");
    return { sent: false, error: e?.message || String(e) };
  }
}

/**
 * Materialize today's weekly schedule (template or default) into OPEN shift rows
 * so late clock-in and the dashboard have real assigned posts to check.
 */
async function ensureTodayShiftsFromSchedule(sequelize) {
  if (!sequelize) return { created: 0, existing: 0 };
  const timeZone = tz();
  const today = dateInTimeZone(timeZone);
  const weekday = weekdayInTimeZone(timeZone);

  const [configs] = await sequelize.query(
    `SELECT tenant_id, building_location, schedule_template
     FROM schedule_config
     ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST`
  );

  const [guards] = await sequelize.query(
    `SELECT id, name, email, tenant_id FROM guards WHERE name IS NOT NULL`
  );

  let location = "248 DUFFIELD STREET";
  try {
    const [sites] = await sequelize.query(
      `SELECT address_1, name FROM sites
       WHERE address_1 ILIKE '%duffield%' OR name ILIKE '%duffield%' OR name ILIKE '%offerman%'
       LIMIT 1`
    );
    if (sites?.[0]?.address_1) location = sites[0].address_1;
  } catch (_) {
    /* sites table optional */
  }

  let created = 0;
  let existing = 0;
  const groups = configs?.length
    ? configs
    : [{ tenant_id: guards?.[0]?.tenant_id || null, building_location: location, schedule_template: [] }];

  for (const cfg of groups) {
    let template = cfg.schedule_template;
    if (!Array.isArray(template) || template.length === 0) {
      template = getDefaultWeeklyTemplate();
    }
    const day = template.find((d) => String(d.day || "").toLowerCase() === weekday.toLowerCase());
    if (!day?.shifts?.length) continue;

    const loc =
      cfg.building_location &&
      !/123 Main Street/i.test(String(cfg.building_location))
        ? cfg.building_location
        : location;

    for (const slot of day.shifts) {
      const guard = findGuardByName(guards || [], slot.scheduledGuard);
      if (!guard) continue;
      const start = String(slot.start || "").slice(0, 5);
      const end = String(slot.end || "").slice(0, 5);
      if (!start) continue;
      const tenantId = cfg.tenant_id || guard.tenant_id || null;

      const [found] = await sequelize.query(
        `
        SELECT id FROM shifts
        WHERE shift_date = $1::date
          AND shift_start::time = $2::time
          AND guard_id = $3::uuid
          AND UPPER(TRIM(COALESCE(status, ''))) NOT IN ('CANCELLED', 'CANCELED')
        LIMIT 1
        `,
        { bind: [today, start, guard.id] }
      );
      if (found?.length) {
        existing += 1;
        continue;
      }

      await sequelize.query(
        `
        INSERT INTO shifts (
          id, tenant_id, guard_id, shift_date, shift_start, shift_end, status, location, created_at
        ) VALUES (
          gen_random_uuid(), $1, $2::uuid, $3::date, $4::time, $5::time, 'OPEN', $6, NOW()
        )
        `,
        { bind: [tenantId, guard.id, today, start, end || null, loc] }
      );
      created += 1;
    }
  }

  if (created) {
    logger.info({ created, existing, today, weekday }, "lateClockIn materialized today's schedule shifts");
  }
  return { created, existing, today, weekday };
}

/**
 * Find assigned shifts past grace with no clock-in, alert once.
 * @returns {Promise<{ checked: number, alerted: number, errors: number }>}
 */
async function runLateClockInCheck(app) {
  const sequelize = app?.locals?.models?.sequelize;
  const models = app?.locals?.models;
  if (!sequelize) return { checked: 0, alerted: 0, errors: 0, reason: "no_db" };

  const grace = graceMinutes();
  const maxH = maxHours();
  const timeZone = tz();

  let synced = { created: 0, existing: 0 };
  try {
    synced = await ensureTodayShiftsFromSchedule(sequelize);
  } catch (e) {
    logger.warn({ err: e?.message }, "lateClockIn schedule sync failed");
  }

  let rows = [];
  try {
    const [found] = await sequelize.query(
      `
      SELECT
        s.id,
        s.guard_id,
        s.tenant_id,
        s.shift_date,
        s.shift_start::text AS shift_start,
        s.shift_end::text AS shift_end,
        s.location,
        s.status,
        g.name AS guard_name,
        g.email AS guard_email,
        ROUND(
          EXTRACT(EPOCH FROM (
            NOW() - ((s.shift_date + s.shift_start::time) AT TIME ZONE $1)
          )) / 60
        )::int AS mins_late
      FROM shifts s
      INNER JOIN guards g ON g.id = s.guard_id
      WHERE s.guard_id IS NOT NULL
        AND s.shift_date IS NOT NULL
        AND s.shift_start IS NOT NULL
        AND UPPER(TRIM(COALESCE(s.status, ''))) NOT IN (
          'CLOSED', 'CANCELLED', 'CANCELED', 'COMPLETED', 'NO_SHOW'
        )
        AND COALESCE(s.ai_decision->>'late_clockin_alerted', 'false') <> 'true'
        AND ((s.shift_date + s.shift_start::time) AT TIME ZONE $1)
            <= NOW() - ($2::int * INTERVAL '1 minute')
        AND ((s.shift_date + s.shift_start::time) AT TIME ZONE $1)
            >= NOW() - ($3::int * INTERVAL '1 hour')
        AND NOT EXISTS (
          SELECT 1 FROM time_entries te
          WHERE te.shift_id = s.id
            AND te.guard_id = s.guard_id
            AND te.clock_in_at IS NOT NULL
        )
      ORDER BY mins_late DESC
      LIMIT 100
      `,
      { bind: [timeZone, grace, maxH] }
    );
    rows = found || [];
  } catch (e) {
    logger.warn({ err: e?.message }, "lateClockIn query failed");
    return { checked: 0, alerted: 0, errors: 1, reason: e?.message };
  }

  let alerted = 0;
  let errors = 0;

  for (const s of rows) {
    try {
      const minsLate = Number(s.mins_late) || grace;
      const locationLabel = s.location || null;
      const guardName = s.guard_name || s.guard_email || "Guard";
      const shiftStart = String(s.shift_start || "").slice(0, 5);

      const marker = JSON.stringify({
        late_clockin_alerted: true,
        late_clockin_alerted_at: new Date().toISOString(),
        late_clockin_mins: minsLate,
      });

      const [updated] = await sequelize.query(
        `
        UPDATE shifts
        SET ai_decision = COALESCE(ai_decision, '{}'::jsonb) || $2::jsonb
        WHERE id = $1::uuid
          AND COALESCE(ai_decision->>'late_clockin_alerted', 'false') <> 'true'
        RETURNING id
        `,
        { bind: [s.id, marker] }
      );
      if (!updated?.length) continue;

      try {
        await sequelize.query(
          `
          INSERT INTO shift_time_entries
            (id, shift_id, guard_id, event_type, event_time, source, meta)
          VALUES
            (gen_random_uuid(), $1::uuid, $2::uuid, 'LATE_CLOCKIN_ALERT', NOW(), 'SYSTEM', $3::jsonb)
          `,
          {
            bind: [
              s.id,
              s.guard_id,
              JSON.stringify({ minsLate, location: locationLabel, graceMinutes: grace }),
            ],
          }
        );
      } catch (_) {
        /* optional audit table */
      }

      const title = `No clock-in: ${guardName}`;
      const message = [
        `${guardName} has not clocked in`,
        locationLabel ? `at ${locationLabel}` : null,
        `(${minsLate} min after ${shiftStart || "start"}).`,
      ]
        .filter(Boolean)
        .join(" ");

      await notify(app, {
        type: "LATE_CLOCKIN",
        title,
        message,
        entityType: "shift",
        entityId: s.id,
        audience: "admin",
        meta: {
          shiftId: s.id,
          guardId: s.guard_id,
          guardName,
          tenantId: s.tenant_id,
          minsLate,
          location: locationLabel,
          shiftDate: s.shift_date,
          shiftStart,
          source: "missed_clock_in",
        },
      });

      const payload = {
        type: "LATE_CLOCKIN",
        skipOpEvent: true,
        shiftId: s.id,
        guardId: s.guard_id,
        guardName,
        tenantId: s.tenant_id,
        tenant_id: s.tenant_id,
        minsLate,
        locationLabel,
        location: locationLabel,
        shiftDate: s.shift_date,
        shiftStart,
        graceMinutes: grace,
        createdAt: new Date().toISOString(),
      };

      const emitToRealtime = app.locals.emitToRealtime || app.get?.("emitToRealtime");
      if (typeof emitToRealtime === "function") {
        const rooms = ["role:all", "admins", "admin", "super_admin"];
        if (s.tenant_id) rooms.push(`admins:${s.tenant_id}`);
        Promise.resolve(emitToRealtime(app, rooms, "late_clockin_alert", payload)).catch((err) => {
          logger.warn({ err: err?.message }, "lateClockIn realtime emit failed");
        });
      }

      try {
        const opsEventService = require("./opsEvent.service");
        if (models?.OpEvent) {
          await opsEventService.createOpEvent(
            {
              tenant_id: s.tenant_id || null,
              site_id: null,
              type: "CLOCKIN",
              severity: "HIGH",
              title,
              summary: locationLabel
                ? `Location: ${locationLabel} | ${minsLate} min late, no clock-in`
                : `${minsLate} min late, no clock-in`,
              entity_refs: {
                shift_id: s.id,
                guard_id: s.guard_id,
                site_address: locationLabel,
              },
              raw_event: payload,
              created_at: new Date(),
              ai_enhanced: false,
              ai_tags: {
                risk_level: "HIGH",
                category: "Compliance",
                auto_summary: message,
                confidence: 0.9,
              },
            },
            models,
            false
          );
        }
      } catch (e) {
        logger.warn({ err: e?.message }, "lateClockIn OpEvent failed");
      }

      await sendLateClockInSms({
        guardName,
        locationLabel,
        minsLate,
        shiftStart,
      });

      alerted += 1;
      logger.info(
        { shiftId: s.id, guardId: s.guard_id, minsLate, locationLabel },
        "lateClockIn alert sent"
      );
    } catch (e) {
      errors += 1;
      logger.warn({ err: e?.message, shiftId: s.id }, "lateClockIn alert failed for shift");
    }
  }

  return {
    checked: rows.length,
    alerted,
    errors,
    graceMinutes: grace,
    tz: timeZone,
    synced,
  };
}

function startLateClockInJob(app) {
  const everyMs = Math.max(15_000, envInt("LATE_CLOCKIN_INTERVAL_MS", 60_000));
  const cronHealth = require("./cronHealth.service");

  const tick = () => {
    runLateClockInCheck(app)
      .then((result) => {
        cronHealth.touch("late-clock-in", {
          ok: true,
          meta: { source: "interval", ...result },
        });
      })
      .catch((err) => {
        cronHealth.touch("late-clock-in", {
          ok: false,
          error: err?.message || "tick failed",
          meta: { source: "interval" },
        });
        logger.warn({ err: err?.message }, "lateClockIn tick failed");
      });
  };

  setTimeout(tick, 15_000);
  setInterval(tick, everyMs);
  logger.info({ everyMs, graceMinutes: graceMinutes(), tz: tz() }, "Late clock-in checker started");
}

module.exports = {
  runLateClockInCheck,
  startLateClockInJob,
  ensureTodayShiftsFromSchedule,
  graceMinutes,
};
