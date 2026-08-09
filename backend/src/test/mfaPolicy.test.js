/**
 * B3 MFA policy unit tests.
 * Run: npx jest src/test/mfaPolicy.test.js --runInBand
 */
const TENANT_PILOT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("mfaPolicy.service", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
    jest.resetModules();
  });

  function load() {
    jest.resetModules();
    return require("../services/mfaPolicy.service");
  }

  test("off by default", () => {
    delete process.env.MFA_REQUIRED;
    delete process.env.MFA_REQUIRED_TENANT_IDS;
    const { isMfaRequiredForAdmin } = load();
    expect(isMfaRequiredForAdmin({ role: "admin", tenant_id: TENANT_PILOT })).toBe(false);
    expect(isMfaRequiredForAdmin({ role: "super_admin", tenant_id: null })).toBe(false);
  });

  test("MFA_REQUIRED=true requires tenant admins, not super_admin by default", () => {
    process.env.MFA_REQUIRED = "true";
    delete process.env.MFA_REQUIRED_FOR_SUPER_ADMIN;
    const { isMfaRequiredForAdmin } = load();
    expect(isMfaRequiredForAdmin({ role: "admin", tenant_id: TENANT_OTHER })).toBe(true);
    expect(isMfaRequiredForAdmin({ role: "supervisor", tenant_id: TENANT_OTHER })).toBe(true);
    expect(isMfaRequiredForAdmin({ role: "super_admin", tenant_id: null })).toBe(false);
  });

  test("MFA_REQUIRED_FOR_SUPER_ADMIN includes super_admin when global on", () => {
    process.env.MFA_REQUIRED = "true";
    process.env.MFA_REQUIRED_FOR_SUPER_ADMIN = "true";
    const { isMfaRequiredForAdmin } = load();
    expect(isMfaRequiredForAdmin({ role: "super_admin" })).toBe(true);
  });

  test("MFA_REQUIRED_TENANT_IDS targets pilot tenant only", () => {
    delete process.env.MFA_REQUIRED;
    process.env.MFA_REQUIRED_TENANT_IDS = `${TENANT_PILOT},${TENANT_OTHER.slice(0, 8)}`;
    // only valid full UUIDs in list — use two full
    process.env.MFA_REQUIRED_TENANT_IDS = `${TENANT_PILOT}`;
    const { isMfaRequiredForAdmin } = load();
    expect(isMfaRequiredForAdmin({ role: "admin", tenant_id: TENANT_PILOT })).toBe(true);
    expect(isMfaRequiredForAdmin({ role: "admin", tenant_id: TENANT_OTHER })).toBe(false);
  });

  test("enrollment allowlist", () => {
    const { isMfaEnrollmentPathAllowed } = load();
    expect(isMfaEnrollmentPathAllowed({ originalUrl: "/api/admin/me" })).toBe(true);
    expect(isMfaEnrollmentPathAllowed({ originalUrl: "/api/admin/mfa/setup" })).toBe(true);
    expect(isMfaEnrollmentPathAllowed({ originalUrl: "/api/admin/guards" })).toBe(false);
  });
});
