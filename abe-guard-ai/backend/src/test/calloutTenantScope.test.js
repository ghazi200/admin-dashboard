/**
 * Callout ranking must never load all tenants' guards.
 * Run: node --test src/test/calloutTenantScope.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildCalloutEligibleWhere,
  excludeCallerGuard,
} = require("../utils/calloutTenantScope");

const TENANT_A = "11111111-1111-1111-1111-111111111111";

describe("calloutTenantScope", () => {
  it("refuses ranking when tenant_id missing", () => {
    const r = buildCalloutEligibleWhere({});
    assert.equal(r.refuseCrossTenant, true);
    assert.equal(r.where, null);
  });

  it("scopes where clause to tenant", () => {
    const r = buildCalloutEligibleWhere({ tenantId: TENANT_A });
    assert.equal(r.refuseCrossTenant, false);
    assert.deepEqual(r.where, {
      is_active: true,
      callout_eligible: true,
      tenant_id: TENANT_A,
    });
  });

  it("excludes caller", () => {
    const out = excludeCallerGuard([{ id: "a" }, { id: "b" }], "a");
    assert.equal(out.length, 1);
    assert.equal(out[0].id, "b");
  });
});
