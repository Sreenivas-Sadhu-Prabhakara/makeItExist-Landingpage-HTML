'use strict';
/**
 * Test helpers – shared fixtures, DB setup/teardown, and session cookie utilities.
 *
 * Tests run against the Postgres database configured in .env (DATABASE_URL).
 * Override with TEST_DATABASE_URL in .env to point at a dedicated test DB.
 *
 * Each suite calls setupTestDb() in beforeAll to wipe & recreate tables,
 * and teardownTestDb() in afterAll to drop them and end the pool.
 */

// Load .env explicitly before requiring server so the pg Pool picks up DATABASE_URL
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';

// Import AFTER env is patched
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { app, pool, dbReady } = require('../server');

// ── DB lifecycle ─────────────────────────────────────────────────────────────

async function setupTestDb() {
  // Ensure server's initializeDatabase() has finished creating tables
  await dbReady;

  // Truncate all data (tables are created by server's initializeDatabase on first load)
  await pool.query('TRUNCATE TABLE bookings, available_slots, admin_users RESTART IDENTITY CASCADE');
  await pool.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE');

  // Seed admin for this suite
  const hash = await bcrypt.hash('WHEREthereiswill1#', 4); // cost 4 – fast for tests
  await pool.query(
    'INSERT INTO admin_users (username, password_hash, display_name) VALUES ($1, $2, $3)',
    ['makeit_exist_admin', hash, 'MakeItExist Admin']
  );
}

async function teardownTestDb() {
  // Do NOT call pool.end() here — the pool is shared across all suites
  // --forceExit will terminate the process after all tests complete
  await pool.query('TRUNCATE TABLE bookings, available_slots, admin_users RESTART IDENTITY CASCADE');
  await pool.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
}

// ── Fixture factories ─────────────────────────────────────────────────────────

async function createUser(overrides = {}) {
  const defaults = {
    google_id: `gid_${Date.now()}_${Math.random()}`,
    email: `user_${Date.now()}@test.com`,
    name: 'Test User',
    picture: 'https://example.com/pic.jpg',
  };
  const u = { ...defaults, ...overrides };
  const result = await pool.query(
    'INSERT INTO users (google_id, email, name, picture) VALUES ($1,$2,$3,$4) RETURNING *',
    [u.google_id, u.email, u.name, u.picture]
  );
  return result.rows[0];
}

async function createBooking(userId, userEmail, overrides = {}) {
  const defaults = {
    project_type: 'website',
    project_name: 'Test Project',
    description: 'A test project',
    preferred_date: '2026-06-01',
    email: userEmail,
    phone: null,
    status: 'pending',
  };
  const b = { ...defaults, ...overrides };
  const result = await pool.query(
    `INSERT INTO bookings (user_id, project_type, project_name, description, preferred_date, email, phone, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [userId, b.project_type, b.project_name, b.description, b.preferred_date, b.email, b.phone, b.status]
  );
  return result.rows[0];
}

async function createSlot(overrides = {}) {
  const defaults = { date: '2026-06-01', time: '10:00', is_available: true };
  const s = { ...defaults, ...overrides };
  const result = await pool.query(
    'INSERT INTO available_slots (date, time, is_available) VALUES ($1,$2,$3) RETURNING *',
    [s.date, s.time, s.is_available]
  );
  return result.rows[0];
}

// ── Session cookie helpers ────────────────────────────────────────────────────

/**
 * Log in as the seeded admin and return the Set-Cookie header value
 * so subsequent requests can be made as admin.
 */
async function loginAsAdmin() {
  const res = await request(app)
    .post('/admin/login')
    .send({ username: 'makeit_exist_admin', password: 'WHEREthereiswill1#' });
  if (res.status !== 200) throw new Error('Admin login failed in helper');
  return res.headers['set-cookie'];
}

/**
 * Inject a Google-authenticated session for an existing DB user.
 * Uses an internal test-only route that is added only when NODE_ENV=test.
 */
async function loginAsUser(userId) {
  const res = await request(app)
    .get(`/__test__/login-as/${userId}`);
  if (res.status !== 200) throw new Error('User login helper failed');
  return res.headers['set-cookie'];
}

module.exports = {
  app,
  pool,
  dbReady,
  setupTestDb,
  teardownTestDb,
  createUser,
  createBooking,
  createSlot,
  loginAsAdmin,
  loginAsUser,
};
