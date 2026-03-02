/**
 * Guard login lock tests: controller behavior (empty body, no user, locked, wrong password, success).
 * Run with: npx jest src/test/guardLoginLock.test.js --runInBand
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_guard_lock";
const bcrypt = require("bcryptjs"); // same as controller
const guardAuthController = require("../controllers/guardAuth.Controller");

function mockRequest(body = {}, appLocals = {}) {
  return {
    body,
    app: { locals: { models: appLocals } },
  };
}

function mockResponse() {
  const res = {};
  res.status = jest.fn().mockReturnThis();
  res.json = jest.fn().mockReturnThis();
  return res;
}

describe("Guard login (controller)", () => {
  test("returns 400 when email and password are missing", async () => {
    const req = mockRequest({});
    const res = mockResponse();
    await guardAuthController.login(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/email and password are required/i) })
    );
  });

  test("returns 400 when password is empty", async () => {
    const req = mockRequest({ email: "a@b.com", password: "" });
    const res = mockResponse();
    await guardAuthController.login(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("returns 401 when guard not found", async () => {
    const req = mockRequest(
      { email: "nonexistent@test.com", password: "any" },
      { Guard: { findOne: jest.fn().mockResolvedValue(null) } }
    );
    const res = mockResponse();
    await guardAuthController.login(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/invalid email or password/i) })
    );
  });

  test("returns 423 when account is locked", async () => {
    const lockedUntil = new Date(Date.now() + 60000); // 1 min from now
    const req = mockRequest(
      { email: "locked@test.com", password: "any" },
      {
        Guard: {
          findOne: jest.fn().mockResolvedValue({
            id: "guard-1",
            email: "locked@test.com",
            name: "Locked",
            password_hash: "$2a$10$dummy",
            failed_login_attempts: 5,
            locked_until: lockedUntil,
            tenant_id: null,
          }),
        },
      }
    );
    const res = mockResponse();
    await guardAuthController.login(req, res);
    expect(res.status).toHaveBeenCalledWith(423);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/account locked/i),
        locked_until: expect.any(String),
      })
    );
  });

  test("wrong password increments failed_login_attempts and returns 401 with remaining", async () => {
    const hash = bcrypt.hashSync("rightpassword", 10);
    const updateMock = jest.fn().mockResolvedValue([1]);
    const req = mockRequest(
      { email: "guard@test.com", password: "wrongpassword" },
      {
        Guard: {
          findOne: jest.fn().mockResolvedValue({
            id: "guard-2",
            email: "guard@test.com",
            name: "Test Guard",
            password_hash: hash,
            failed_login_attempts: 0,
            locked_until: null,
            tenant_id: null,
          }),
          update: updateMock,
        },
      }
    );
    const res = mockResponse();
    await guardAuthController.login(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/attempt\(s\) remaining before lock/i) })
    );
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ failed_login_attempts: 1 }),
      expect.objectContaining({ where: { id: "guard-2" } })
    );
  });

  test("correct password returns token and guard, and clears lock", async () => {
    const hash = bcrypt.hashSync("correctpassword", 10);
    const updateMock = jest.fn().mockResolvedValue([1]);
    const req = mockRequest(
      { email: "guard@test.com", password: "correctpassword" },
      {
        Guard: {
          findOne: jest.fn().mockResolvedValue({
            id: "guard-3",
            email: "guard@test.com",
            name: "Test Guard",
            password_hash: hash,
            failed_login_attempts: 2,
            locked_until: null,
            tenant_id: null,
          }),
          update: updateMock,
        },
      }
    );
    const res = mockResponse();
    await guardAuthController.login(req, res);
    expect(res.status).not.toHaveBeenCalledWith(401);
    expect(res.status).not.toHaveBeenCalledWith(423);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.any(String),
        guard: expect.objectContaining({
          id: "guard-3",
          email: "guard@test.com",
          name: "Test Guard",
        }),
      })
    );
    expect(updateMock).toHaveBeenCalledWith(
      { failed_login_attempts: 0, locked_until: null },
      expect.objectContaining({ where: { id: "guard-3" } })
    );
  });
});
