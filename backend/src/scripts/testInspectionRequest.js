/**
 * Live inspection-request test against the shared production DB.
 * Creates inspection_requests if missing (Admins.id is integer, not UUID),
 * then sends a PENDING request to SETH at 248 Duffield.
 *
 * Run: node src/scripts/testInspectionRequest.js
 */
const path = require("path");
const fs = require("fs");

const backendEnv = path.resolve(__dirname, "../../.env");
if (fs.existsSync(backendEnv)) require("dotenv").config({ path: backendEnv });
else require("dotenv").config();

const { sequelize, OpEvent } = require("../models");
const { notify } = require("../utils/notify");

function challengeCode() {
  return `ABE-${Math.floor(1000 + Math.random() * 9000)}`;
}

async function ensureTable(sequelize) {
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
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS idx_inspection_requests_guard ON inspection_requests (guard_id)`
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS idx_inspection_requests_status ON inspection_requests (tenant_id, status)`
  );
}

async function main() {
  await sequelize.authenticate();
  await ensureTable(sequelize);

  const [sites] = await sequelize.query(`
    SELECT id, name, address_1, tenant_id FROM sites
    WHERE address_1 ILIKE '%duffield%' OR name ILIKE '%offerman%'
    LIMIT 1
  `);
  const site = sites[0];
  if (!site) throw new Error("No Duffield / Offerman site found");

  const [guards] = await sequelize.query(
    `SELECT id, name, email, tenant_id FROM guards WHERE name ILIKE 'SETH' LIMIT 1`
  );
  const guard = guards[0];
  if (!guard) throw new Error("Guard SETH not found");

  const [admins] = await sequelize.query(
    `SELECT id, name, email FROM "Admins" ORDER BY id LIMIT 1`
  );
  const admin = admins[0];
  if (!admin) throw new Error("No admin found");

  let code = challengeCode();
  for (let i = 0; i < 8; i++) {
    const [dup] = await sequelize.query(
      `SELECT id FROM inspection_requests WHERE challenge_code = $1 LIMIT 1`,
      { bind: [code] }
    );
    if (!dup?.length) break;
    code = challengeCode();
  }

  const dueAt = new Date(Date.now() + 10 * 60 * 1000);
  const instructions =
    "TEST inspection: Photograph the lobby/post at 248 Duffield. Hold your badge and show challenge code in the selfie.";

  const [inserted] = await sequelize.query(
    `
    INSERT INTO inspection_requests (
      id, tenant_id, site_id, guard_id, requested_by_admin_id,
      challenge_code, instructions, required_items_json, due_at, status
    ) VALUES (
      gen_random_uuid(), $1, $2, $3, $4,
      $5, $6, $7::jsonb, $8, 'PENDING'
    )
    RETURNING id, challenge_code, due_at, status, created_at
    `,
    {
      bind: [
        guard.tenant_id || site.tenant_id,
        site.id,
        guard.id,
        admin.id,
        code,
        instructions,
        JSON.stringify({ selfie: true, badge: true, signage: false }),
        dueAt.toISOString(),
      ],
    }
  );
  const request = inserted[0];

  const title = `Inspection request — ${guard.name}`;
  const locationLabel = site.address_1 || site.name;
  const summary = `Location: ${locationLabel} | Challenge ${code} | Due in 10 min`;

  const app = { locals: { models: require("../models"), emitToRealtime: async () => {} } };
  app.locals.models.sequelize = sequelize;

  await notify(app, {
    type: "INSPECTION_REQUEST",
    title,
    message: `${guard.name} must complete a post inspection at ${locationLabel}. Challenge code ${code}.`,
    entityType: "inspection",
    entityId: request.id,
    audience: "admin",
    meta: {
      inspection_id: request.id,
      guard_id: guard.id,
      site_id: site.id,
      challenge_code: code,
      location: locationLabel,
    },
  });

  if (OpEvent) {
    await OpEvent.create({
      tenant_id: guard.tenant_id || site.tenant_id,
      site_id: site.id,
      type: "INSPECTION",
      severity: "MEDIUM",
      title,
      summary,
      entity_refs: {
        inspection_id: request.id,
        guard_id: guard.id,
        site_id: site.id,
        site_address: locationLabel,
        challenge_code: code,
      },
      ai_enhanced: false,
      ai_tags: {
        risk_level: "MEDIUM",
        category: "Compliance",
        auto_summary: summary,
        confidence: 0.9,
      },
      raw_event: {
        type: "inspection:request",
        inspectionId: request.id,
        guardId: guard.id,
        guardName: guard.name,
        locationLabel,
        challenge_code: code,
      },
      created_at: new Date(),
    });
  }

  const [verify] = await sequelize.query(
    `SELECT id, challenge_code, status, due_at FROM inspection_requests WHERE id = $1`,
    { bind: [request.id] }
  );

  console.log("\n✅ Inspection request test passed\n");
  console.log("  Request ID:     ", request.id);
  console.log("  Challenge code: ", code);
  console.log("  Guard:          ", guard.name, guard.email);
  console.log("  Site:           ", site.name, "—", locationLabel);
  console.log("  Due:            ", dueAt.toISOString());
  console.log("  Status:         ", verify[0]?.status);
  console.log("  Requested by:   ", admin.email, `(id ${admin.id})`);
  console.log("\n  Command Center should show an INSPECTION event.");
  console.log("  Notification: Inspection request — SETH\n");

  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Inspection request test failed:", e);
  process.exit(1);
});
