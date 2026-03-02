const request = require('supertest');
const app = require('../../app'); // your Express app
const db = require('../models');
const bcrypt = require('bcrypt');

describe('ADMIN LOGIN TEST', () => {

  beforeAll(async () => {
    // Sync only Admin so we avoid syncing models that use SQLite-incompatible types (e.g. ScheduledReport ARRAY)
    await db.Admin.sync({ force: true });
    // Login controller reads from req.app.locals.models
    app.locals.models = db;

    const hashedPassword = await bcrypt.hash('password123', 10);
    await db.Admin.create({
      name: 'Super Admin',
      email: 'admin@test.com',
      password: hashedPassword,
    });
  });

  afterAll(async () => {
    await db.sequelize.close();
  });

  it('should login admin and return JWT token', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({
        email: 'admin@test.com',
        password: 'password123'
      });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.admin.email).toBe('admin@test.com');
  });

  it('should reject invalid password', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({
        email: 'admin@test.com',
        password: 'wrongpassword'
      });

    expect(res.statusCode).toBe(401);
  });

});
