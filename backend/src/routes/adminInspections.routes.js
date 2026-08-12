/**
 * Admin inspections on the unified admin-dashboard API (same DB as SOS / Command Center).
 */
const express = require("express");
const router = express.Router();
const authAdmin = require("../middleware/authAdmin");
const { requireAccess } = require("../middleware/requireAccess");
const { getTenantFilter } = require("../utils/tenantFilter");

function challengeCode() {
  return `ABE-${Math.floor(1000 + Math.random() * 9000)}`;
}

async function ensureInspectionRequestsTable(sequelize) {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS inspection_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID,
      site_id UUID,
      shift_id UUID,
      guard_id UUID,
      requested_by_admin_id INTEGER,
      challenge_code VARCHAR(32) NOT NULL UNIQUE,
      instructions TEXT,
      required_items_json JSONB DEFAULT '{}'::jsonb,
      due_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function tenantScope(admin, query) {
  const role = String(admin?.role || "").toLowerCase();
  const isSuper = role === "super_admin";
  if (isSuper) return query.tenantId || query.tenant_id || null;
  return getTenantFilter(admin);
}

router.get(
  "/requests",
  authAdmin,
  requireAccess("dashboard:read"),
  async (req, res) => {
    try {
      const { sequelize } = req.app.locals.models || {};
      if (!sequelize) return res.status(503).json({ message: "Database not ready" });
      await ensureInspectionRequestsTable(sequelize);

      const tenantId = tenantScope(req.admin, req.query);
      const role = String(req.admin?.role || "").toLowerCase();
      if (role !== "super_admin" && !tenantId) {
        return res.status(400).json({
          message: "Missing tenantId. Tenant admin must be assigned to a tenant.",
        });
      }

      const status = req.query.status ? String(req.query.status).trim().toUpperCase() : null;
      const siteId = req.query.siteId || req.query.site_id || null;
      const guardId = req.query.guardId || req.query.guard_id || null;
      const limit = Math.min(Number(req.query.limit || 50), 200);

      const params = [];
      const clauses = [];
      if (tenantId) {
        params.push(tenantId);
        clauses.push(`r.tenant_id = $${params.length}`);
      }
      if (status) {
        params.push(status);
        clauses.push(`r.status = $${params.length}`);
      }
      if (siteId) {
        params.push(siteId);
        clauses.push(`r.site_id = $${params.length}`);
      }
      if (guardId) {
        params.push(guardId);
        clauses.push(`r.guard_id = $${params.length}`);
      }
      params.push(limit);
      const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

      const [rows] = await sequelize.query(
        `
        SELECT
          r.*,
          s.name AS site_name,
          s.address_1 AS site_address,
          g.name AS guard_name,
          g.email AS guard_email
        FROM inspection_requests r
        LEFT JOIN sites s ON s.id = r.site_id
        LEFT JOIN guards g ON g.id = r.guard_id
        ${whereSql}
        ORDER BY r.created_at DESC
        LIMIT $${params.length}
        `,
        { bind: params }
      );

      const out = (rows || []).map((r) => ({
        ...r,
        site: r.site_id
          ? { id: r.site_id, name: r.site_name, address_1: r.site_address }
          : null,
        location_text: r.site_address || r.site_name || null,
      }));

      return res.json(out);
    } catch (e) {
      console.error("listInspectionRequests error:", e);
      return res.status(500).json({ message: e.message || "Failed to list inspections" });
    }
  }
);

router.get(
  "/sites",
  authAdmin,
  requireAccess("dashboard:read"),
  async (req, res) => {
    try {
      const { sequelize } = req.app.locals.models || {};
      if (!sequelize) return res.status(503).json({ message: "Database not ready" });
      const tenantId = tenantScope(req.admin, req.query);
      const params = [];
      let sql = `SELECT id, name, address_1, address_2, tenant_id FROM sites`;
      if (tenantId) {
        params.push(tenantId);
        sql += ` WHERE tenant_id = $1 OR tenant_id IS NULL`;
      }
      sql += ` ORDER BY name`;
      const [rows] = await sequelize.query(sql, { bind: params });
      return res.json(rows || []);
    } catch (e) {
      return res.status(500).json({ message: e.message || "Failed to list sites" });
    }
  }
);

router.post(
  "/requests",
  authAdmin,
  requireAccess("dashboard:write"),
  async (req, res) => {
    try {
      const { sequelize } = req.app.locals.models || {};
      if (!sequelize) return res.status(503).json({ message: "Database not ready" });
      await ensureInspectionRequestsTable(sequelize);

      const tenantId = tenantScope(req.admin, req.query) || req.admin?.tenant_id || null;
      const {
        site_id,
        guard_id = null,
        shift_id = null,
        instructions = null,
        required_items = {},
        due_minutes = 10,
      } = req.body || {};

      if (!site_id) {
        return res.status(400).json({ message: "Missing required field: site_id" });
      }

      const [sites] = await sequelize.query(
        `SELECT id, name, address_1, tenant_id FROM sites WHERE id = $1 LIMIT 1`,
        { bind: [site_id] }
      );
      const site = sites[0];
      if (!site) return res.status(400).json({ message: "Invalid site_id" });

      let targetGuardIds = [];
      if (guard_id) {
        const [g] = await sequelize.query(
          `SELECT id, name, tenant_id FROM guards WHERE id = $1 LIMIT 1`,
          { bind: [guard_id] }
        );
        if (!g[0]) return res.status(400).json({ message: "Invalid guard_id" });
        targetGuardIds = [guard_id];
      } else {
        const [clocked] = await sequelize.query(
          `
          SELECT DISTINCT te.guard_id
          FROM time_entries te
          INNER JOIN shifts sh ON sh.id = te.shift_id
          WHERE te.clock_in_at IS NOT NULL
            AND (te.clock_out_at IS NULL OR te.clock_out_at < te.clock_in_at)
            AND (
              sh.location ILIKE '%' || $1 || '%'
              OR sh.site_id = $2
            )
          `,
          { bind: [site.address_1 || site.name || "", site.id] }
        );
        targetGuardIds = (clocked || []).map((r) => r.guard_id).filter(Boolean);
      }

      if (!targetGuardIds.length) {
        return res.status(400).json({
          message: "Pick a guard, or wait until someone is clocked in at this site.",
        });
      }

      let code = challengeCode();
      for (let i = 0; i < 8; i++) {
        const [dup] = await sequelize.query(
          `SELECT id FROM inspection_requests WHERE challenge_code = $1 LIMIT 1`,
          { bind: [code] }
        );
        if (!dup?.length) break;
        code = challengeCode();
      }

      const dueAt = new Date(Date.now() + Math.max(1, Number(due_minutes) || 10) * 60 * 1000);
      const adminId = Number.isFinite(Number(req.admin?.id)) ? Number(req.admin.id) : null;
      const created = [];

      for (const gid of targetGuardIds) {
        const [ins] = await sequelize.query(
          `
          INSERT INTO inspection_requests (
            id, tenant_id, site_id, shift_id, guard_id, requested_by_admin_id,
            challenge_code, instructions, required_items_json, due_at, status
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5,
            $6, $7, $8::jsonb, $9, 'PENDING'
          )
          RETURNING *
          `,
          {
            bind: [
              tenantId || site.tenant_id,
              site_id,
              shift_id || null,
              gid,
              adminId,
              code,
              instructions,
              JSON.stringify(required_items || {}),
              dueAt.toISOString(),
            ],
          }
        );
        created.push(ins[0]);
      }

      const locationLabel = site.address_1 || site.name;
      const emitToRealtime = req.app.locals.emitToRealtime;
      const payload = {
        type: "inspection:request",
        count: created.length,
        site_id,
        siteName: site.name,
        locationLabel,
        challenge_code: code,
        instructions,
        due_at: dueAt.toISOString(),
        requests: created,
      };

      if (typeof emitToRealtime === "function") {
        const rooms = ["role:all", "admins", "admin"];
        if (tenantId) rooms.push(`admins:${tenantId}`);
        Promise.resolve(emitToRealtime(req.app, rooms, "inspection:request:created", payload)).catch(
          () => {}
        );
        for (const row of created) {
          Promise.resolve(
            emitToRealtime(req.app, [`guard:${row.guard_id}`], "inspection:request", {
              ...payload,
              id: row.id,
              guard_id: row.guard_id,
            })
          ).catch(() => {});
        }
      }

      try {
        const opsEventService = require("../services/opsEvent.service");
        await opsEventService.createOpEvent(
          {
            tenant_id: tenantId || site.tenant_id,
            site_id: site.id,
            type: "INSPECTION",
            severity: "MEDIUM",
            title: `Inspection request — ${locationLabel}`,
            summary: `Location: ${locationLabel} | Challenge ${code}`,
            entity_refs: {
              inspection_id: created[0]?.id,
              site_id: site.id,
              site_address: locationLabel,
              challenge_code: code,
            },
            raw_event: payload,
            created_at: new Date(),
          },
          req.app.locals.models,
          false
        );
      } catch (_) {
        /* non-fatal */
      }

      return res.json({
        ok: true,
        requests: created.length === 1 ? created[0] : created,
        count: created.length,
        challenge_code: code,
      });
    } catch (e) {
      console.error("createInspectionRequest error:", e);
      return res.status(500).json({ message: e.message || "Failed to create inspection" });
    }
  }
);

router.patch(
  "/requests/:id",
  authAdmin,
  requireAccess("dashboard:write"),
  async (req, res) => {
    try {
      const { sequelize } = req.app.locals.models || {};
      if (!sequelize) return res.status(503).json({ message: "Database not ready" });

      const status = String(req.body?.status || "").trim().toUpperCase();
      if (!["APPROVED", "REJECTED", "PENDING", "EXPIRED"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const tenantId = tenantScope(req.admin, req.query);
      const params = [status, req.params.id];
      let sql = `UPDATE inspection_requests SET status = $1, updated_at = NOW() WHERE id = $2`;
      if (tenantId) {
        params.push(tenantId);
        sql += ` AND tenant_id = $3`;
      }
      sql += ` RETURNING *`;
      const [rows] = await sequelize.query(sql, { bind: params });
      if (!rows?.[0]) return res.status(404).json({ message: "Inspection request not found" });
      return res.json({ ok: true, request: rows[0] });
    } catch (e) {
      return res.status(500).json({ message: e.message || "Update failed" });
    }
  }
);

module.exports = router;
