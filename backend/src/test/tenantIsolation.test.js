/**
 * B1 — Tenant isolation tests (CI).
 * Fails if cross-tenant read/write is allowed on hot paths.
 *
 * Run: npm test -- --testPathPattern=tenantIsolation
 */
const {
  getTenantFilter,
  getTenantWhere,
  getTenantSqlFilter,
  ensureTenantId,
  canAccessTenant,
} = require("../utils/tenantFilter");

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const SHIFT_B = "33333333-3333-3333-3333-333333333333";
const SWAP_B = "44444444-4444-4444-4444-444444444444";
const GUARD_B = "55555555-5555-5555-5555-555555555555";

const superAdmin = { id: 1, role: "super_admin", tenant_id: null };
const adminA = { id: 2, role: "admin", tenant_id: TENANT_A };
const adminB = { id: 3, role: "admin", tenant_id: TENANT_B };
const supervisorA = { id: 4, role: "supervisor", tenant_id: TENANT_A };

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnThis();
  res.json = jest.fn().mockReturnThis();
  return res;
}

describe("tenantFilter helpers", () => {
  test("super_admin has no tenant filter", () => {
    expect(getTenantFilter(superAdmin)).toBeNull();
    expect(getTenantWhere(superAdmin)).toBeNull();
  });

  test("admin/supervisor filter to their tenant only", () => {
    expect(getTenantFilter(adminA)).toBe(TENANT_A);
    expect(getTenantWhere(adminA)).toEqual({ tenant_id: TENANT_A });
    expect(getTenantFilter(supervisorA)).toBe(TENANT_A);
  });

  test("SQL filter binds tenant for admins, empty for super_admin", () => {
    const paramsA = [];
    expect(getTenantSqlFilter(adminA, paramsA)).toMatch(/tenant_id/);
    expect(paramsA).toEqual([TENANT_A]);

    const paramsS = [];
    expect(getTenantSqlFilter(superAdmin, paramsS)).toBe("");
    expect(paramsS).toEqual([]);
  });

  test("ensureTenantId forces admin tenant and preserves super_admin choice", () => {
    expect(ensureTenantId(adminA, { name: "G" }).tenant_id).toBe(TENANT_A);
    expect(ensureTenantId(adminA, { name: "G", tenant_id: TENANT_B }).tenant_id).toBe(TENANT_A);
    expect(ensureTenantId(superAdmin, { name: "G", tenant_id: TENANT_B }).tenant_id).toBe(TENANT_B);
    expect(ensureTenantId(superAdmin, { name: "G" }).tenant_id).toBeUndefined();
  });

  test("canAccessTenant blocks cross-tenant for admin, allows super_admin", () => {
    expect(canAccessTenant(adminA, TENANT_A)).toBe(true);
    expect(canAccessTenant(adminA, TENANT_B)).toBe(false);
    expect(canAccessTenant(supervisorA, TENANT_B)).toBe(false);
    expect(canAccessTenant(superAdmin, TENANT_B)).toBe(true);
  });
});

describe("shift swap approve/reject isolation", () => {
  const swapCtrl = require("../controllers/adminShiftSwap.controller");

  function swapReq(admin, models) {
    return {
      admin,
      params: { id: SWAP_B },
      body: {},
      app: { locals: { models } },
    };
  }

  test("approve returns 403 when shift belongs to another tenant", async () => {
    const models = {
      ShiftSwap: {
        findByPk: jest.fn().mockResolvedValue({
          id: SWAP_B,
          status: "pending",
          target_guard_id: GUARD_B,
          shift_id: SHIFT_B,
          requester_guard_id: GUARD_B,
        }),
      },
      Shift: {
        findByPk: jest.fn().mockResolvedValue({
          id: SHIFT_B,
          tenant_id: TENANT_B,
          guard_id: GUARD_B,
          shift_date: "2099-01-01",
          shift_start: "09:00",
          shift_end: "17:00",
          status: "CLOSED",
        }),
      },
      sequelize: { transaction: jest.fn() },
    };
    const res = mockRes();
    await swapCtrl.approveShiftSwap(swapReq(adminA, models), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/access/i) })
    );
    expect(models.sequelize.transaction).not.toHaveBeenCalled();
  });

  test("reject returns 403 when shift belongs to another tenant", async () => {
    const models = {
      ShiftSwap: {
        findByPk: jest.fn().mockResolvedValue({
          id: SWAP_B,
          status: "pending",
          target_guard_id: GUARD_B,
          shift_id: SHIFT_B,
        }),
      },
      Shift: {
        findByPk: jest.fn().mockResolvedValue({
          id: SHIFT_B,
          tenant_id: TENANT_B,
        }),
      },
      sequelize: { transaction: jest.fn() },
    };
    const res = mockRes();
    await swapCtrl.rejectShiftSwap(swapReq(adminA, models), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(models.sequelize.transaction).not.toHaveBeenCalled();
  });

  test("super_admin is not blocked by tenant on reject path check", async () => {
    expect(canAccessTenant(superAdmin, TENANT_B)).toBe(true);
  });
});

describe("pending accept override isolation", () => {
  const pending = require("../services/shiftAcceptPending.service");

  function sequelizeWithColumnsReady(shiftRow) {
    return {
      query: jest.fn().mockImplementation(async (sql) => {
        if (String(sql).includes("information_schema")) {
          return [
            [{ column_name: "pending_guard_id" }, { column_name: "accept_pending_until" }],
          ];
        }
        if (shiftRow) return [[shiftRow]];
        return [[]];
      }),
    };
  }

  test("overridePendingAccept throws 403 for cross-tenant admin", async () => {
    const sequelize = sequelizeWithColumnsReady({
      id: SHIFT_B,
      tenant_id: TENANT_B,
      pending_guard_id: GUARD_B,
      status: "OPEN",
    });

    const app = { locals: { models: { sequelize } } };
    await expect(
      pending.overridePendingAccept(app, {
        shiftId: SHIFT_B,
        adminId: adminA.id,
        admin: adminA,
        action: "reject",
      })
    ).rejects.toMatchObject({ status: 403, message: expect.stringMatching(/access/i) });
  });

  test("listPendingAccepts binds tenant filter when tenantId provided", async () => {
    const sequelize = sequelizeWithColumnsReady(null);
    await pending.listPendingAccepts(sequelize, { tenantId: TENANT_A });
    const listCall = sequelize.query.mock.calls.find(([sql]) =>
      String(sql).includes("pending_guard_id IS NOT NULL")
    );
    expect(listCall).toBeTruthy();
    expect(listCall[0]).toMatch(/s\.tenant_id/);
    expect(listCall[1].bind).toEqual([TENANT_A]);
  });

  test("listPendingAccepts omits tenant filter for super_admin (null tenantId)", async () => {
    const sequelize = sequelizeWithColumnsReady(null);
    await pending.listPendingAccepts(sequelize, { tenantId: null });
    const listCall = sequelize.query.mock.calls.find(([sql]) =>
      String(sql).includes("pending_guard_id IS NOT NULL")
    );
    expect(listCall[0]).not.toMatch(/s\.tenant_id =/);
    expect(listCall[1].bind).toEqual([]);
  });
});

describe("guard password / contact prefs path isolation", () => {
  const guardsCtrl = require("../controllers/adminGuards.controller");

  test("setGuardPassword returns 403 for other-tenant guard", async () => {
    const req = {
      admin: adminA,
      params: { id: GUARD_B },
      body: { password: "Password123!" },
      app: {
        locals: {
          models: {
            Guard: {
              findByPk: jest.fn().mockResolvedValue({
                id: GUARD_B,
                email: "x@y.com",
                tenant_id: TENANT_B,
              }),
            },
          },
        },
      },
    };
    const res = mockRes();
    await guardsCtrl.setGuardPassword(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test("updateGuard returns 403 for other-tenant guard (contact prefs / consent)", async () => {
    const req = {
      admin: adminA,
      params: { id: GUARD_B },
      body: { communications_consent: true, contact_preferences: { email: true } },
      app: {
        locals: {
          models: {
            Guard: {
              findByPk: jest.fn().mockResolvedValue({
                id: GUARD_B,
                tenant_id: TENANT_B,
                name: "Other",
                email: "o@t.com",
              }),
            },
            sequelize: {},
          },
        },
      },
    };
    const res = mockRes();
    await guardsCtrl.updateGuard(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe("admin messages conversation list tenant scope", () => {
  test("non–super-admin conversation where includes tenant_id", () => {
    const tenantId = getTenantFilter(adminA);
    const where = {};
    if (tenantId) where.tenant_id = tenantId;
    expect(where).toEqual({ tenant_id: TENANT_A });

    const whereSuper = {};
    const tid = getTenantFilter(superAdmin);
    if (tid) whereSuper.tenant_id = tid;
    expect(whereSuper).toEqual({});
  });

  test("admin B cannot use admin A filter", () => {
    expect(getTenantFilter(adminB)).toBe(TENANT_B);
    expect(getTenantFilter(adminB)).not.toBe(getTenantFilter(adminA));
  });
});

describe("callout ranking tenant scope helper", () => {
  const {
    buildCalloutEligibleWhere,
    excludeCallerGuard,
  } = require("../../../abe-guard-ai/backend/src/utils/calloutTenantScope");

  test("requires tenant_id — refuses global guard ranking", () => {
    const r = buildCalloutEligibleWhere({ tenantId: null });
    expect(r.refuseCrossTenant).toBe(true);
    expect(r.where).toBeNull();
  });

  test("scopes eligible guards to tenant", () => {
    const r = buildCalloutEligibleWhere({ tenantId: TENANT_A });
    expect(r.refuseCrossTenant).toBe(false);
    expect(r.where).toEqual({
      is_active: true,
      callout_eligible: true,
      tenant_id: TENANT_A,
    });
  });

  test("excludes caller from eligible set", () => {
    const guards = [{ id: GUARD_B }, { id: TENANT_A }];
    expect(excludeCallerGuard(guards, GUARD_B)).toHaveLength(1);
    expect(excludeCallerGuard(guards, GUARD_B)[0].id).toBe(TENANT_A);
  });
});
