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

async function generateSosAiSuggestions({ guardName, lat, lng, tenantId, locationLabel }) {
  const locationText =
    locationLabel ||
    (lat != null && lng != null ? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}` : null);
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

async function placeSosVoiceCall({ toPhone, guardName, lat, lng, locationLabel }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER;
  const to = toE164(toPhone);
  if (!accountSid || !authToken) return { placed: false, reason: "twilio_not_configured" };
  if (!from) return { placed: false, reason: "missing_from_number" };
  if (!to) return { placed: false, reason: "no_phone" };

  let loc;
  if (locationLabel) {
    loc = `Location: ${locationLabel}.`;
  } else if (lat != null && lng != null) {
    loc = `Location approximately latitude ${Number(lat).toFixed(4)}, longitude ${Number(lng).toFixed(4)}.`;
  } else {
    loc = "Location was not available.";
  }
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
  <Say voice="alice">Repeat. Emergency S O S${locationLabel ? ` at ${String(locationLabel).replace(/&/g, "and")}` : ""}. Check the admin dashboard now.</Say>
</Response>`;

  try {
    const twilio = require("twilio");
    const client = twilio(accountSid, authToken);
    const call = await client.calls.create({ to, from, twiml });
    console.log(`📞 SOS voice started sid=${call.sid} to=${to}`);
    return { placed: true, to, sid: call.sid, status: call.status, locationLabel: locationLabel || null };
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

function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (Number(d) * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Match GPS to nearest site address (handles longitudes stored without minus sign).
 */
async function resolveNearestSite(sequelize, { tenantId, lat, lng }) {
  if (lat == null || lng == null || !sequelize) return null;
  try {
    const params = [];
    let sql = `SELECT id, name, address_1, address_2, latitude, longitude, tenant_id FROM sites WHERE latitude IS NOT NULL AND longitude IS NOT NULL`;
    if (tenantId) {
      params.push(tenantId);
      sql += ` AND (tenant_id = $1 OR tenant_id IS NULL)`;
    }
    sql += ` LIMIT 200`;
    const [rows] = await sequelize.query(sql, { bind: params });
    if (!rows?.length) return null;

    let best = null;
    let bestMiles = Infinity;
    const gLat = Number(lat);
    const gLng = Number(lng);

    for (const s of rows) {
      const sLat = Number(s.latitude);
      let sLng = Number(s.longitude);
      if (!Number.isFinite(sLat) || !Number.isFinite(sLng)) continue;
      // NYC-ish longitudes in DB sometimes lack the minus sign
      const candidates = [sLng];
      if (sLng > 0 && gLng < 0) candidates.push(-sLng);
      if (sLng < 0 && gLng > 0) candidates.push(Math.abs(sLng));

      for (const lon of candidates) {
        const miles = haversineMiles(gLat, gLng, sLat, lon);
        if (miles < bestMiles) {
          bestMiles = miles;
          best = s;
        }
      }
    }

    // Accept within ~5 miles for city posts; otherwise still prefer nearest site name if < 25 mi
    if (!best || bestMiles > 25) return null;

    const address =
      [best.address_1, best.address_2].filter(Boolean).join(", ") ||
      best.name ||
      null;

    return {
      siteId: best.id,
      siteName: best.name || null,
      address,
      miles: Math.round(bestMiles * 100) / 100,
    };
  } catch (e) {
    console.warn("resolveNearestSite failed:", e?.message || e);
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

  const nearest = await resolveNearestSite(sequelize, { tenantId, lat, lng });
  const locationLabel =
    nearest?.address ||
    nearest?.siteName ||
    (lat != null && lng != null
      ? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`
      : null);

  // Prefer fast path: DB + call first; AI can use fallback if slow
  let ai = defaultAiSuggestions({
    guardName,
    locationText: locationLabel,
  });
  try {
    ai = await generateSosAiSuggestions({
      guardName,
      lat,
      lng,
      tenantId,
      locationLabel,
    });
    if (locationLabel) ai.locationText = locationLabel;
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
        siteId: nearest?.siteId || null,
        title: `EMERGENCY SOS — ${guardName}`,
        type: "EMERGENCY_SOS",
        description: [
          `Guard ${guardName} activated Emergency SOS.`,
          locationLabel ? `Location: ${locationLabel}` : "Location unavailable.",
          nearest?.miles != null ? `(~${nearest.miles} mi from matched site)` : "",
          lat != null && lng != null
            ? `GPS: ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`
            : "",
          "",
          ai.summary,
          "",
          "Suggested actions:",
          ...(ai.suggestedActions || []).map((a, i) => `${i + 1}. ${a}`),
        ]
          .filter(Boolean)
          .join("\n"),
        status: "OPEN",
        severity: "CRITICAL",
        occurredAt: new Date(),
        reportedAt: new Date(),
        locationText: locationLabel,
        aiSummary: ai.summary,
        aiTagsJson: {
          source: "emergency_sos",
          emergencyEventId: emergencyId,
          suggestedActions: ai.suggestedActions,
          siteId: nearest?.siteId || null,
          siteName: nearest?.siteName || null,
          siteAddress: nearest?.address || null,
        },
      });
    }
  } catch (e) {
    console.warn("SOS incident create failed (non-fatal):", e?.message || e);
  }

  // Command Center feed: write OpEvent directly (don't rely on Redis realtime path)
  try {
    const opsEventService = require("./opsEvent.service");
    const models = app.locals.models;
    await opsEventService.createOpEvent(
      {
        tenant_id: tenantId,
        site_id: nearest?.siteId || null,
        type: "INCIDENT",
        severity: "CRITICAL",
        title: `EMERGENCY SOS — ${guardName}`,
        summary: [
          locationLabel ? `Location: ${locationLabel}` : null,
          ai.summary,
          (ai.suggestedActions || []).slice(0, 3).map((a, i) => `${i + 1}. ${a}`).join(" "),
        ]
          .filter(Boolean)
          .join(" | "),
        entity_refs: {
          incident_id: incident?.id || null,
          emergency_event_id: emergencyId,
          guard_id: guard.id,
          site_id: nearest?.siteId || null,
          site_address: nearest?.address || locationLabel || null,
          site_name: nearest?.siteName || null,
        },
        raw_event: {
          type: "emergency:sos",
          emergencyEventId: emergencyId,
          guardId: guard.id,
          guardName,
          locationLabel,
          incidentId: incident?.id || null,
        },
        created_at: new Date(),
        ai_enhanced: false,
        ai_tags: {
          risk_level: "CRITICAL",
          category: "Incident",
          auto_summary: ai.summary,
          confidence: 0.85,
          suggested_actions: ai.suggestedActions || [],
        },
      },
      models,
      false // skip slow AI tagging so SOS stays fast
    );
  } catch (e) {
    console.warn("SOS OpEvent create failed:", e?.message || e);
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
    locationLabel,
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
    locationLabel,
    site: nearest
      ? { id: nearest.siteId, name: nearest.siteName, address: nearest.address }
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
          siteId: nearest?.siteId || null,
          locationLabel,
          location_text: locationLabel,
          description: incident.description,
          skipOpEvent: true, // OpEvent already written in triggerEmergencySos
          incident: {
            id: incident.id,
            type: incident.type,
            severity: incident.severity,
            description: incident.description,
            location_text: locationLabel,
            site_id: nearest?.siteId || null,
          },
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
      locationLabel,
      site: payload.site,
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
  resolveNearestSite,
};
