/**
 * Production Emergency SOS on admin-dashboard API.
 * Creates emergency_events + incidents, notifies supervisor via Twilio voice,
 * and attaches AI suggested actions.
 */

const { randomUUID } = require("crypto");
const { chatCompletionsCreate, isChatAvailable } = require("../utils/aiClient");

function toE164(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return null;
  if (raw.startsWith("+")) return raw.replace(/\s/g, "");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  // Common typo: 347-0530-7327 (11 digits) → 347-530-7327
  if (digits.length === 11 && digits.startsWith("3470")) {
    return `+1${digits.slice(0, 3)}${digits.slice(4)}`;
  }
  return `+${digits}`;
}

function defaultAiSuggestions({ guardName, locationText }) {
  return {
    summary: `SOS from ${guardName || "a guard"}. Treat as active until supervisor confirms safety.`,
    suggestedActions: [
      "Call the guard immediately and confirm status and exact location",
      "Dispatch nearest available supervisor or backup to the site",
      "Notify client/site contact if required by post orders",
      "Keep the SOS open on the dashboard until the scene is clear, then resolve with notes",
      "File/update the linked incident with outcome and any injuries/property damage",
    ],
    locationText: locationText || null,
  };
}

async function generateSosAiSuggestions({ guardName, lat, lng, tenantId }) {
  const locationText =
    lat != null && lng != null ? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}` : null;
  const fallback = defaultAiSuggestions({ guardName, locationText });

  try {
    if (!isChatAvailable()) return fallback;

    const aiPromise = chatCompletionsCreate({
      messages: [
        { role: "system", content: "Return valid JSON only." },
        {
          role: "user",
          content: [
            "You are a security operations supervisor AI.",
            "A guard activated Emergency SOS. Return STRICT JSON only:",
            '{"summary":"1-2 sentences","suggestedActions":["action1","action2","action3","action4","action5"]}',
            "Actions must be concrete ops steps (call, dispatch, notify, document). No markdown.",
            `Guard: ${guardName || "unknown"}`,
            `Location: ${locationText || "unknown"}`,
            `Tenant: ${tenantId || "unknown"}`,
          ].join("\n"),
        },
      ],
      temperature: 0.2,
      max_tokens: 350,
    });

    const { completion } = await Promise.race([
      aiPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("AI_TIMEOUT")), 10000)
      ),
    ]);
    const text = completion?.choices?.[0]?.message?.content;
    if (!text) return fallback;
    const cleaned = String(text).replace(/```json\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed?.summary || !Array.isArray(parsed.suggestedActions)) return fallback;
    return {
      summary: String(parsed.summary),
      suggestedActions: parsed.suggestedActions.map(String).slice(0, 8),
      locationText,
    };
  } catch (e) {
    console.warn("SOS AI suggestions fallback:", e?.message || e);
    return fallback;
  }
}

async function placeSosVoiceCall({ toPhone, guardName, lat, lng }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER;
  const to = toE164(toPhone);
  if (!accountSid || !authToken) return { placed: false, reason: "twilio_not_configured" };
  if (!from) return { placed: false, reason: "missing_from_number" };
  if (!to) return { placed: false, reason: "no_phone" };

  const loc =
    lat != null && lng != null
      ? `Location approximately latitude ${Number(lat).toFixed(4)}, longitude ${Number(lng).toFixed(4)}.`
      : "Location was not available.";
  const say = [
    "Alert from Abe Guard.",
    `Emergency S O S activated by ${guardName || "a guard"}.`,
    loc,
    "Open the admin dashboard immediately and confirm the guard is safe.",
  ].join(" ");

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${say.replace(/&/g, "and").replace(/</g, " ")}</Say>
  <Pause length="1"/>
  <Say voice="alice">Repeat. Emergency S O S. Check the admin dashboard now.</Say>
</Response>`;

  try {
    const twilio = require("twilio");
    const client = twilio(accountSid, authToken);
    const call = await client.calls.create({ to, from, twiml });
    console.log(`📞 SOS voice started sid=${call.sid} to=${to}`);
    return { placed: true, to, sid: call.sid, status: call.status };
  } catch (e) {
    console.error("SOS voice call failed:", e?.message || e);
    return { placed: false, error: e?.message || String(e), code: e?.code, to };
  }
}

/**
 * Resolve who to call: SOS_NOTIFY_PHONE / SOS_SUPERVISOR_PHONE env, else admin mfa_phone/phone.
 */
function resolveNotifyPhone(adminRow) {
  const envPhone =
    process.env.SOS_NOTIFY_PHONE ||
    process.env.SOS_SUPERVISOR_PHONE ||
    process.env.SOS_ADMIN_PHONE ||
    "";
  if (String(envPhone).trim()) return toE164(envPhone);
  if (!adminRow) return null;
  return (
    toE164(adminRow.mfa_phone) ||
    toE164(adminRow.phone) ||
    toE164(adminRow.phone_number) ||
    toE164(adminRow.mobile) ||
    null
  );
}

async function findOnCallSupervisor(sequelize, tenantId) {
  try {
    const params = [];
    let sql = `
      SELECT id, name, email, role, tenant_id,
             mfa_phone
      FROM "Admins"
      WHERE role IN ('admin', 'supervisor', 'super_admin')
    `;
    if (tenantId) {
      params.push(tenantId);
      sql += ` AND (tenant_id = $1 OR role = 'super_admin')`;
    }
    sql += ` ORDER BY CASE WHEN role = 'supervisor' THEN 0 WHEN role = 'admin' THEN 1 ELSE 2 END, "createdAt" ASC NULLS LAST LIMIT 5`;
    const [rows] = await sequelize.query(sql, { bind: params });
    return rows?.[0] || null;
  } catch (e) {
    console.warn("SOS supervisor lookup failed:", e?.message || e);
    return null;
  }
}

async function ensureEmergencyContactsTable(sequelize) {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS emergency_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guard_id UUID NOT NULL,
      tenant_id UUID NULL,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS emergency_contacts_guard_id ON emergency_contacts (guard_id);
  `);
}

async function triggerEmergencySos(app, { guardId, lat, lng, accuracy, notifyPhoneOverride }) {
  const { sequelize, Guard, Incident } = app.locals.models || {};
  if (!sequelize) {
    const err = new Error("Database not ready");
    err.status = 503;
    throw err;
  }

  const guard = await Guard.findByPk(guardId);
  if (!guard) {
    const err = new Error("Guard not found");
    err.status = 404;
    throw err;
  }

  const tenantId = guard.tenant_id || null;
  const guardName = guard.name || guard.email || "Guard";
  const supervisor = await findOnCallSupervisor(sequelize, tenantId);

  // Prefer fast path: DB + call first; AI can use fallback if slow
  let ai = defaultAiSuggestions({
    guardName,
    locationText:
      lat != null && lng != null ? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}` : null,
  });
  try {
    ai = await generateSosAiSuggestions({ guardName, lat, lng, tenantId });
  } catch (_) {
    /* keep fallback */
  }

  const emergencyId = randomUUID();
  const notes = [
    supervisor
      ? `Notified supervisor admin_id=${supervisor.id} (${supervisor.email || supervisor.name || ""})`
      : "No supervisor row found",
    `AI: ${ai.summary}`,
    `Actions: ${(ai.suggestedActions || []).join(" | ")}`,
  ].join("\n");

  try {
    await sequelize.query(
      `
      INSERT INTO emergency_events (
        id, guard_id, tenant_id, supervisor_id, latitude, longitude, accuracy,
        status, notes, activated_at
      ) VALUES (
        $1, $2, $3, NULL, $4, $5, $6, 'active', $7, NOW()
      )
      `,
      {
        bind: [
          emergencyId,
          guard.id,
          tenantId,
          lat != null ? Number(lat) : null,
          lng != null ? Number(lng) : null,
          accuracy != null ? Number(accuracy) : null,
          notes,
        ],
      }
    );
  } catch (e) {
    console.error("emergency_events insert failed:", e?.message || e);
    throw e;
  }

  let incident = null;
  try {
    if (Incident) {
      incident = await Incident.create({
        tenantId,
        guardId: guard.id,
        title: `EMERGENCY SOS — ${guardName}`,
        type: "EMERGENCY_SOS",
        description: [
          `Guard ${guardName} activated Emergency SOS.`,
          ai.locationText ? `GPS: ${ai.locationText}` : "GPS unavailable.",
          "",
          ai.summary,
          "",
          "Suggested actions:",
          ...(ai.suggestedActions || []).map((a, i) => `${i + 1}. ${a}`),
        ].join("\n"),
        status: "OPEN",
        severity: "CRITICAL",
        occurredAt: new Date(),
        reportedAt: new Date(),
        locationText: ai.locationText,
        aiSummary: ai.summary,
        aiTagsJson: {
          source: "emergency_sos",
          emergencyEventId: emergencyId,
          suggestedActions: ai.suggestedActions,
        },
      });
    }
  } catch (e) {
    console.warn("SOS incident create failed (non-fatal):", e?.message || e);
  }

  const notifyPhone =
    toE164(notifyPhoneOverride) ||
    resolveNotifyPhone(supervisor) ||
    toE164(process.env.SOS_NOTIFY_PHONE);

  const callResult = await placeSosVoiceCall({
    toPhone: notifyPhone,
    guardName,
    lat,
    lng,
  });

  const payload = {
    type: "EMERGENCY_SOS",
    emergencyEventId: emergencyId,
    guardId: guard.id,
    guardName,
    tenantId,
    supervisor: supervisor
      ? {
          id: supervisor.id,
          name: supervisor.name || supervisor.email,
          email: supervisor.email,
          phone: notifyPhone,
        }
      : null,
    location:
      lat != null && lng != null
        ? { lat: Number(lat), lng: Number(lng), accuracy: accuracy != null ? Number(accuracy) : null }
        : null,
    incidentId: incident?.id || null,
    ai,
    dialStatus: callResult.placed ? "initiated" : callResult.reason || callResult.error || "failed",
    call: callResult,
    timestamp: new Date().toISOString(),
  };

  try {
    const emitToRealtime = app.locals.emitToRealtime;
    if (typeof emitToRealtime === "function") {
      await emitToRealtime(app, ["role:all", "admins", "super_admin"], "emergency:sos", payload);
      if (tenantId) {
        await emitToRealtime(app, [`admins:${tenantId}`], "emergency:sos", payload);
      }
      if (incident?.id) {
        await emitToRealtime(app, ["role:all", "admins"], "incidents:new", {
          id: incident.id,
          title: incident.title,
          severity: incident.severity,
          type: incident.type,
          tenantId,
        });
      }
    }
  } catch (e) {
    console.warn("SOS realtime emit failed:", e?.message || e);
  }

  return {
    ok: true,
    message: "Emergency SOS activated. Supervisors have been notified.",
    emergency: {
      id: emergencyId,
      guardId: guard.id,
      guardName,
      supervisor: payload.supervisor,
      dialStatus: payload.dialStatus,
      call: callResult,
      location: payload.location,
      activatedAt: payload.timestamp,
      incidentId: incident?.id || null,
      ai,
    },
  };
}

module.exports = {
  toE164,
  triggerEmergencySos,
  ensureEmergencyContactsTable,
  placeSosVoiceCall,
  generateSosAiSuggestions,
};
