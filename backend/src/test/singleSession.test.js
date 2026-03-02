/**
 * Single-session tests: session_token_version in JWT and auth middleware
 * rejects tokens with older version (e.g. after new login or "log out other devices").
 * Run with: npx jest src/test/singleSession.test.js --runInBand
 */
const jwt = require("jsonwebtoken");

const JWT_SECRET = "test_jwt_secret_single_session";

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

const authAdmin = require("../middleware/authAdmin");

describe("Single session (session_token_version)", () => {
  test("authAdmin rejects token when JWT sessionTokenVersion < DB session_token_version", async () => {
    const adminId = "test-admin-id-123";
    const tokenVersion = 1;
    const dbVersion = 2; // e.g. user logged in elsewhere or clicked "log out other devices"
    const token = jwt.sign(
      { adminId, role: "admin", permissions: [], sessionTokenVersion: tokenVersion },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    const req = {
      headers: { authorization: `Bearer ${token}` },
      app: {
        locals: {
          models: {
            Admin: {
              findByPk: jest.fn().mockResolvedValue({
                session_token_version: dbVersion,
              }),
            },
          },
        },
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await authAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Session invalidated"),
      })
    );
  });

  test("authAdmin allows token when JWT sessionTokenVersion equals DB session_token_version", async () => {
    const adminId = "test-admin-id-456";
    const version = 2;
    const token = jwt.sign(
      { adminId, role: "admin", permissions: [], sessionTokenVersion: version },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    const req = {
      headers: { authorization: `Bearer ${token}` },
      app: {
        locals: {
          models: {
            Admin: {
              findByPk: jest.fn().mockResolvedValue({
                session_token_version: version,
              }),
            },
          },
        },
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await authAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.admin).toEqual(
      expect.objectContaining({
        id: adminId,
        role: "admin",
      })
    );
  });

  test("authAdmin treats token without sessionTokenVersion as 0 (backward compat)", async () => {
    const adminId = "test-admin-id-789";
    const token = jwt.sign(
      { adminId, role: "admin", permissions: [] },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    const req = {
      headers: { authorization: `Bearer ${token}` },
      app: {
        locals: {
          models: {
            Admin: {
              findByPk: jest.fn().mockResolvedValue({
                session_token_version: 0,
              }),
            },
          },
        },
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await authAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.admin.id).toBe(adminId);
  });
});
