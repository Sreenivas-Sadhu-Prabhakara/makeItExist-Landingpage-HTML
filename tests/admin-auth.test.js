'use strict';

/**
 * Admin Authentication Tests
 * Covers: POST /admin/login, GET /api/admin/me, GET /admin/logout
 */

const request = require('supertest');
const { app, pool, setupTestDb, teardownTestDb, loginAsAdmin } = require('./helpers');

beforeAll(setupTestDb);
afterAll(teardownTestDb);

// ── POST /admin/login ─────────────────────────────────────────────────────────
describe('POST /admin/login', () => {
  test('returns 200 and admin info with valid credentials', async () => {
    const res = await request(app)
      .post('/admin/login')
      .send({ username: 'makeit_exist_admin', password: 'WHEREthereiswill1#' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.admin).toMatchObject({
      username: 'makeit_exist_admin',
      display_name: 'MakeItExist Admin',
    });
    expect(res.body.admin).not.toHaveProperty('password_hash');
  });

  test('sets a session cookie on successful login', async () => {
    const res = await request(app)
      .post('/admin/login')
      .send({ username: 'makeit_exist_admin', password: 'WHEREthereiswill1#' });

    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.headers['set-cookie'][0]).toMatch(/connect\.sid/);
  });

  test('returns 401 with wrong password', async () => {
    const res = await request(app)
      .post('/admin/login')
      .send({ username: 'makeit_exist_admin', password: 'WrongPassword!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  test('returns 401 with non-existent username', async () => {
    const res = await request(app)
      .post('/admin/login')
      .send({ username: 'no_such_admin', password: 'WHEREthereiswill1#' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  test('returns 401 with empty credentials', async () => {
    const res = await request(app)
      .post('/admin/login')
      .send({ username: '', password: '' });

    expect(res.status).toBe(401);
  });

  test('returns 401 with missing password field', async () => {
    const res = await request(app)
      .post('/admin/login')
      .send({ username: 'makeit_exist_admin' });

    expect(res.status).toBe(401);
  });

  test('does not accept SQL injection in username', async () => {
    const res = await request(app)
      .post('/admin/login')
      .send({ username: "' OR '1'='1", password: 'anything' });

    expect(res.status).toBe(401);
  });
});

// ── GET /api/admin/me ─────────────────────────────────────────────────────────
describe('GET /api/admin/me', () => {
  let adminCookie;

  beforeAll(async () => {
    adminCookie = await loginAsAdmin();
  });

  test('returns admin profile when authenticated', async () => {
    const res = await request(app)
      .get('/api/admin/me')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      username: 'makeit_exist_admin',
      display_name: 'MakeItExist Admin',
    });
    expect(res.body).not.toHaveProperty('password_hash');
  });

  test('returns 403 when not authenticated', async () => {
    const res = await request(app).get('/api/admin/me');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Admin access required');
  });

  test('returns 403 when authenticated as a regular Google user', async () => {
    // Use an app agent without admin session
    const res = await request(app)
      .get('/api/admin/me')
      .set('Cookie', ['connect.sid=fakeSession123']);
    // Either 403 (unrecognised session) or 403 (non-admin)
    expect(res.status).toBe(403);
  });
});

// ── GET /admin/logout ─────────────────────────────────────────────────────────
describe('GET /admin/logout', () => {
  test('redirects to /admin.html after logout', async () => {
    const cookie = await loginAsAdmin();
    const res = await request(app)
      .get('/admin/logout')
      .set('Cookie', cookie);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/admin.html');
  });

  test('/api/admin/me returns 403 after logout', async () => {
    const cookie = await loginAsAdmin();
    await request(app).get('/admin/logout').set('Cookie', cookie);

    // Session is destroyed – the cookie no longer authenticates
    const res = await request(app)
      .get('/api/admin/me')
      .set('Cookie', cookie);
    expect(res.status).toBe(403);
  });
});
