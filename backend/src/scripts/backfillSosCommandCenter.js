/**
 * Backfill SOS incidents into Command Center (ops_events) and set site addresses.
 * Run: node src/scripts/backfillSosCommandCenter.js
 */
const path = require("path");
const fs = require("fs");

const backendEnv = path.resolve(__dirname, "../../.env");
if (fs.existsSync(backendEnv)) require("dotenv").config({ path: backendEnv });
else require("dotenv").config();

const { sequelize, OpEvent } = require("../models");
const { resolveNearestSite } = require("../services/emergencySos.service");

async function main() {
  await sequelize.authenticate();

  // Fix longitudes stored without minus (NYC)
  const [lonFix] = await sequelize.query(`
    UPDATE sites
    SET longitude = -ABS(longitude)
    WHERE latitude BETWEEN 40 AND 41.5
      AND longitude > 70 AND longitude < 80
    RETURNING id, name, address_1, latitude, longitude
  `);
  console.log("Fixed site longitudes:", lonFix?.length || 0, lonFix);

  const [incidents] = await sequelize.query(`
    SELECT id, tenant_id, guard_id, title, description, severity, location_text,
           site_id, ai_summary, ai_tags_json, reported_at, created_at
    FROM incidents
    WHERE type = 'EMERGENCY_SOS' OR title ILIKE '%EMERGENCY SOS%'
    ORDER BY COALESCE(reported_at, created_at) DESC
    LIMIT 50
  `);

  console.log("SOS incidents found:", incidents.length);

  for (const inc of incidents) {
    let locationLabel = inc.location_text;
    let siteId = inc.site_id;

    // Prefer existing site address if site_id already set
    if (siteId && (!locationLabel || /^\s*-?\d+\.\d+\s*,/.test(String(locationLabel)))) {
      const [sites] = await sequelize.query(
        `SELECT id, name, address_1, address_2 FROM sites WHERE id = $1 LIMIT 1`,
        { bind: [siteId] }
      );
      if (sites[0]?.address_1) {
        locationLabel = sites[0].address_1;
      }
    }

    // Match from GPS in description if still coords / empty
    if (!locationLabel || /^\s*-?\d+\.\d+\s*,/.test(String(locationLabel))) {
      const gpsMatch =
        String(inc.description || "").match(/GPS:\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/i) ||
        String(inc.location_text || "").match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
      if (gpsMatch) {
        const nearest = await resolveNearestSite(sequelize, {
          tenantId: inc.tenant_id,
          lat: Number(gpsMatch[1]),
          lng: Number(gpsMatch[2]),
        });
        if (nearest) {
          locationLabel = nearest.address || nearest.siteName;
          siteId = nearest.siteId;
        }
      }
    }

    // Fallback: nearest/default Duffield site
    if (!locationLabel) {
      const [sites] = await sequelize.query(`
        SELECT id, name, address_1 FROM sites
        WHERE address_1 ILIKE '%duffield%' OR name ILIKE '%duffield%' OR name ILIKE '%offerman%'
        ORDER BY CASE WHEN tenant_id IS NULL THEN 1 ELSE 0 END
        LIMIT 1
      `);
      if (sites[0]) {
        locationLabel = sites[0].address_1 || sites[0].name;
        siteId = sites[0].id;
      }
    }

    if (locationLabel || siteId) {
      await sequelize.query(
        `
        UPDATE incidents
        SET location_text = COALESCE($1, location_text),
            site_id = COALESCE($2::uuid, site_id)
        WHERE id = $3
        `,
        { bind: [locationLabel || null, siteId || null, inc.id] }
      );
      console.log("Updated incident", inc.id, "→", locationLabel, siteId);
    }

    // Create OpEvent if missing (match by incident_id only — titles collide across SOS events)
    const [existing] = await sequelize.query(
      `
      SELECT id FROM ops_events
      WHERE type = 'INCIDENT'
        AND (
          entity_refs->>'incident_id' = $1
          OR raw_event->>'incidentId' = $1
        )
      LIMIT 1
      `,
      { bind: [String(inc.id)] }
    );

    if (existing?.length) {
      console.log("OpEvent already exists for", inc.id);
      // Refresh location in summary if needed
      if (locationLabel) {
        await sequelize.query(
          `
          UPDATE ops_events
          SET summary = CASE
                WHEN summary ILIKE 'Location:%' THEN summary
                ELSE 'Location: ' || $1 || ' | ' || COALESCE(summary, '')
              END,
              site_id = COALESCE(site_id, $2::uuid),
              entity_refs = COALESCE(entity_refs, '{}'::jsonb) || jsonb_build_object(
                'site_address', $1::text,
                'incident_id', $3::text
              )
          WHERE id = $4
          `,
          { bind: [locationLabel, siteId || null, String(inc.id), existing[0].id] }
        );
      }
      continue;
    }

    if (!OpEvent) {
      console.warn("OpEvent model missing; inserting via SQL");
      await sequelize.query(
        `
        INSERT INTO ops_events (
          id, tenant_id, site_id, type, severity, title, summary,
          entity_refs, ai_enhanced, ai_tags, raw_event, created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, 'INCIDENT', 'CRITICAL', $3, $4,
          $5::jsonb, false, $6::jsonb, $7::jsonb, COALESCE($8::timestamptz, NOW())
        )
        `,
        {
          bind: [
            inc.tenant_id,
            siteId || null,
            inc.title || "EMERGENCY SOS",
            locationLabel
              ? `Location: ${locationLabel} | ${inc.ai_summary || "Emergency SOS"}`
              : inc.ai_summary || "Emergency SOS",
            JSON.stringify({
              incident_id: inc.id,
              guard_id: inc.guard_id,
              site_id: siteId,
              site_address: locationLabel,
            }),
            JSON.stringify({
              risk_level: "CRITICAL",
              category: "Incident",
              auto_summary: inc.ai_summary || "Emergency SOS",
              confidence: 0.85,
            }),
            JSON.stringify({ type: "emergency:sos", backfill: true, incidentId: inc.id }),
            inc.reported_at || inc.created_at,
          ],
        }
      );
    } else {
      await OpEvent.create({
        tenant_id: inc.tenant_id,
        site_id: siteId || null,
        type: "INCIDENT",
        severity: "CRITICAL",
        title: inc.title || "EMERGENCY SOS",
        summary: locationLabel
          ? `Location: ${locationLabel} | ${inc.ai_summary || "Emergency SOS"}`
          : inc.ai_summary || "Emergency SOS",
        entity_refs: {
          incident_id: inc.id,
          guard_id: inc.guard_id,
          site_id: siteId,
          site_address: locationLabel,
        },
        ai_enhanced: false,
        ai_tags: {
          risk_level: "CRITICAL",
          category: "Incident",
          auto_summary: inc.ai_summary || "Emergency SOS",
          confidence: 0.85,
        },
        raw_event: { type: "emergency:sos", backfill: true, incidentId: inc.id, locationLabel },
        created_at: inc.reported_at || inc.created_at || new Date(),
      });
    }
    console.log("Created OpEvent for incident", inc.id);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
