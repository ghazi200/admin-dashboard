/**
 * Parse guard CSV and create guards for a tenant (bulk import).
 * Columns (header row required; aliases accepted):
 *   name*, email, phone, communications_consent|consent,
 *   email_pref, sms_pref, phone_pref, in_app_pref,
 *   callout_eligible, active
 */
const {
  ensureTenantId,
  isValidTenantUuid,
  resolveAdminTenantForWrite,
} = require("../utils/tenantFilter");
const { setGuardContactPreferences } = require("../utils/contactPreferences");

const MAX_ROWS = 500;

const TEMPLATE_CSV = [
  "name,email,phone,communications_consent,email_pref,sms_pref,phone_pref,in_app_pref,callout_eligible,active",
  "Jane Doe,jane@example.com,+15551234567,true,true,true,true,true,true,true",
  "John Smith,john@example.com,+15557654321,false,true,false,false,true,true,true",
].join("\n") + "\n";

function parseBool(v, defaultValue = false) {
  if (v == null || String(v).trim() === "") return defaultValue;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return defaultValue;
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

function headerMap(headers) {
  const map = {};
  headers.forEach((h, i) => {
    const key = normalizeHeader(h);
    map[key] = i;
    // aliases
    if (key === "consent" || key === "sms_consent" || key === "comms_consent") {
      map.communications_consent = i;
    }
    if (key === "full_name" || key === "guard_name") map.name = i;
    if (key === "e_mail") map.email = i;
    if (key === "mobile" || key === "cell") map.phone = i;
    if (key === "pref_email") map.email_pref = i;
    if (key === "pref_sms") map.sms_pref = i;
    if (key === "pref_phone" || key === "pref_voice") map.phone_pref = i;
    if (key === "pref_in_app" || key === "pref_inapp") map.in_app_pref = i;
  });
  return map;
}

function cell(cols, map, key) {
  const i = map[key];
  if (i == null || i >= cols.length) return "";
  return cols[i] != null ? String(cols[i]).trim() : "";
}

/**
 * @param {string} csvText
 * @returns {{ rows: object[], errors: { line: number, message: string }[] }}
 */
function parseGuardCsv(csvText) {
  const text = String(csvText || "").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const errors = [];
  if (lines.length < 2) {
    return { rows: [], errors: [{ line: 1, message: "CSV needs a header row and at least one data row" }] };
  }

  const headers = splitCsvLine(lines[0]);
  const map = headerMap(headers);
  if (map.name == null) {
    return { rows: [], errors: [{ line: 1, message: "Missing required column: name" }] };
  }

  const rows = [];
  for (let li = 1; li < lines.length; li++) {
    const lineNo = li + 1;
    if (li > MAX_ROWS) {
      errors.push({ line: lineNo, message: `Exceeded max ${MAX_ROWS} rows` });
      break;
    }
    const cols = splitCsvLine(lines[li]);
    const name = cell(cols, map, "name");
    if (!name) {
      errors.push({ line: lineNo, message: "name is required" });
      continue;
    }
    const email = cell(cols, map, "email") || null;
    const phone = cell(cols, map, "phone") || null;
    const consent = parseBool(cell(cols, map, "communications_consent"), false);
    const hasPrefCol =
      map.email_pref != null ||
      map.sms_pref != null ||
      map.phone_pref != null ||
      map.in_app_pref != null;

    const contact_preferences = hasPrefCol
      ? {
          email: parseBool(cell(cols, map, "email_pref"), true),
          sms: parseBool(cell(cols, map, "sms_pref"), true),
          phone: parseBool(cell(cols, map, "phone_pref"), true),
          in_app: parseBool(cell(cols, map, "in_app_pref"), true),
        }
      : null;

    rows.push({
      line: lineNo,
      name,
      email,
      phone,
      communications_consent: consent,
      callout_eligible: parseBool(cell(cols, map, "callout_eligible"), true),
      active: parseBool(cell(cols, map, "active"), true),
      contact_preferences,
    });
  }

  return { rows, errors };
}

async function importGuards(req, csvText) {
  const { Guard, sequelize } = req.app.locals.models || {};
  if (!Guard) {
    const err = new Error("Guard model not available");
    err.status = 503;
    throw err;
  }

  const adminCtx = await resolveAdminTenantForWrite(req);
  const role = String(adminCtx.role || "").toLowerCase();

  let tenantId = null;
  if (role === "super_admin") {
    const tid = req.body?.tenant_id ?? req.body?.tenantId ?? req.query?.tenant_id;
    if (tid && isValidTenantUuid(tid)) tenantId = String(tid).trim();
    else if (adminCtx.tenant_id && isValidTenantUuid(adminCtx.tenant_id)) {
      tenantId = adminCtx.tenant_id;
    }
  } else {
    const stamped = ensureTenantId(adminCtx, {});
    tenantId = stamped.tenant_id || null;
  }

  if (!tenantId || !isValidTenantUuid(tenantId)) {
    const err = new Error(
      role === "super_admin"
        ? "tenant_id is required for CSV import (body or query)."
        : "Your administrator account is not linked to a tenant."
    );
    err.status = 400;
    throw err;
  }

  const { rows, errors: parseErrors } = parseGuardCsv(csvText);
  const created = [];
  const skipped = [];
  const failed = [...parseErrors];

  const { emitAuditEvent, actorFromAdmin } = require("./auditEvent.service");
  const actor = actorFromAdmin(req.admin);

  for (const row of rows) {
    try {
      if (row.email) {
        const existing = await Guard.findOne({
          where: { email: row.email },
          attributes: ["id", "email", "tenant_id"],
        });
        if (existing) {
          skipped.push({
            line: row.line,
            email: row.email,
            reason: "email_already_exists",
            guardId: existing.id,
          });
          continue;
        }
      }

      const base = {
        name: row.name,
        email: row.email,
        phone: row.phone,
        active: row.active,
        callout_eligible: row.callout_eligible,
        tenant_id: tenantId,
      };
      if (row.communications_consent) {
        base.communications_consent = true;
        base.consent_at = new Date();
        base.consent_source = "admin_csv_import";
      } else {
        base.communications_consent = false;
        base.consent_at = null;
        base.consent_source = null;
      }

      const guard = await Guard.create(base);

      if (row.contact_preferences) {
        try {
          await setGuardContactPreferences(sequelize, guard.id, row.contact_preferences);
        } catch (_) {
          /* non-fatal */
        }
      }

      try {
        await emitAuditEvent(req.app, {
          tenantId,
          ...actor,
          action: "guard.import",
          entityType: "guard",
          entityId: guard.id,
          summary: `CSV import created ${guard.name || guard.email}`,
          after: {
            email: guard.email,
            phone: guard.phone,
            communications_consent: guard.communications_consent,
            source: "csv",
          },
        });
      } catch (_) {
        /* non-fatal */
      }

      created.push({
        line: row.line,
        id: guard.id,
        name: guard.name,
        email: guard.email,
      });
    } catch (e) {
      failed.push({
        line: row.line,
        email: row.email,
        message: e.message || "create failed",
      });
    }
  }

  return {
    ok: true,
    tenant_id: tenantId,
    summary: {
      parsed: rows.length,
      created: created.length,
      skipped: skipped.length,
      failed: failed.length,
    },
    created,
    skipped,
    failed,
  };
}

module.exports = {
  TEMPLATE_CSV,
  MAX_ROWS,
  parseGuardCsv,
  parseBool,
  importGuards,
};
