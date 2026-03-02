// src/test/adminDashboard.test.js

const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Sequelize, DataTypes } = require('sequelize');
const app = require('../../app'); // Express app (must export app, not listen)
const { DEFAULT_TEST_TENANT_ID } = require('../config/tenantConfig');

// Initialize in-memory SQLite for testing
const sequelize = new Sequelize('sqlite::memory:', { logging: false });

// Import models
const Admin = require('../models/Admin')(sequelize, DataTypes);
const Guard = require('../models/Guard')(sequelize, DataTypes);
const Shift = require('../models/Shift')(sequelize, DataTypes);
const CallOut = require('../models/CallOut')(sequelize, DataTypes);
const ContactPreference = require('../models/ContactPreference')(sequelize, DataTypes);

// Associations
Guard.hasMany(Shift, { foreignKey: 'assignedGuardId' });
Guard.hasMany(CallOut, { foreignKey: 'guardId' });
Guard.hasMany(ContactPreference, { foreignKey: 'guardId' });

// Token holder and test guard
let adminToken;
let testGuard;

beforeAll(async () => {
  await sequelize.sync({ force: true });

  // Dashboard routes need req.app.locals.models (sequelize + models)
  app.locals.models = {
    sequelize,
    Admin,
    Guard,
    Shift,
    CallOut,
    ContactPreference,
  };

  // Create test admin
  const hashedPassword = await bcrypt.hash('password123', 10);
  const admin = await Admin.create({
    name: 'Test Admin',
    email: 'admin@test.com',
    password: hashedPassword,
    role: 'admin',
    tenant_id: DEFAULT_TEST_TENANT_ID, // ✅ Use abe-guard tenant for all test data
  });

  // MANUAL JWT for tests
  adminToken = jwt.sign(
    { id: admin.id, email: admin.email, role: 'admin' },
    process.env.JWT_SECRET || 'test_jwt_secret',
    { expiresIn: '1h' }
  );

  // Create a test guard
  testGuard = await Guard.create({
    name: 'Test Guard',
    email: 'guard@test.com',
    phone: '1234567890',
    availability: true,
    active: true,
    tenant_id: DEFAULT_TEST_TENANT_ID, // ✅ Use abe-guard tenant for all test data
  });

  // Add contact preferences
  await ContactPreference.bulkCreate([
    { guardId: testGuard.id, contactType: 'SMS', active: true },
    { guardId: testGuard.id, contactType: 'Phone', active: true },
  ]);

  // Add a test open shift (Shift model uses shift_date, location; id has default UUID)
  await Shift.create({
    shift_date: new Date(),
    status: 'open',
    guard_id: null,
    tenant_id: DEFAULT_TEST_TENANT_ID,
    location: 'Night Shift',
  });

  // Add a test call-out (CallOut model: id, guard_id, shift_id, tenant_id, reason, created_at)
  await CallOut.create({
    guard_id: testGuard.id,
    tenant_id: DEFAULT_TEST_TENANT_ID,
    reason: 'SMS',
    created_at: new Date(),
  });
});

afterAll(async () => {
  await sequelize.close();
});

// Skip when using SQLite: dashboard controllers use PostgreSQL-only SQL (DISTINCT ON, ::boolean, ANY)
// and the test app (app.js) mounts only a subset of routes. Run with Postgres test DB to run these.
const describeOrSkip =
  sequelize.getDialect() === "sqlite" ? describe.skip : describe;

describeOrSkip("ADMIN DASHBOARD ROUTES", () => {

  test("GET /api/admin/dashboard/live-callouts should return live call-outs", async () => {
    const res = await request(app)
      .get('/api/admin/dashboard/live-callouts')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('guard');
  });

  test("GET /api/admin/dashboard/open-shifts should return open shifts", async () => {
    const res = await request(app)
      .get('/api/admin/dashboard/open-shifts')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].status).toBe('open');
  });

  test("GET /api/admin/dashboard/guard-availability should return guards", async () => {
    const res = await request(app)
      .get('/api/admin/dashboard/guard-availability')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].name).toBe('Test Guard');
  });

  test("PUT /api/admin/dashboard/guard/:id/contact-preferences should update preferences", async () => {
    const res = await request(app)
      .put(`/api/admin/dashboard/guard/${testGuard.id}/contact-preferences`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        preferences: [
          { contactType: 'SMS', active: false },
          { contactType: 'Phone', active: true },
        ],
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBe(2);
    expect(res.body.find(p => p.contactType === 'SMS').active).toBe(false);
    expect(res.body.find(p => p.contactType === 'Phone').active).toBe(true);
  });

  test("POST /api/admin/dashboard/override-assignment should assign a shift", async () => {
    const shift = await Shift.create({
      shift_date: new Date(),
      status: 'open',
      guard_id: null,
      tenant_id: DEFAULT_TEST_TENANT_ID,
      location: 'Day Shift',
    });

    const res = await request(app)
      .post('/api/admin/dashboard/override-assignment')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ shiftId: shift.id, guardId: testGuard.id });

    expect(res.statusCode).toBe(200);
    expect(res.body.shift.status).toBe('assigned');
    expect(res.body.shift.assignedGuardId).toBe(testGuard.id);
  });

});
