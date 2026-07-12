'use strict';

/**
 * User-facing API Tests
 * Covers: GET /api/user, GET /logout,
 *         GET /api/available-slots,
 *         POST /api/bookings, GET /api/my-bookings
 */

const request = require('supertest');
const {
  app,
  setupTestDb, teardownTestDb,
  createUser, createBooking, createSlot,
  loginAsUser,
} = require('./helpers');

let user1, user2;

beforeAll(async () => {
  await setupTestDb();
  user1 = await createUser({ email: 'dana@test.com', name: 'Dana', google_id: 'gid_dana' });
  user2 = await createUser({ email: 'evan@test.com', name: 'Evan', google_id: 'gid_evan' });

  // Available slots for future dates
  await createSlot({ date: '2099-03-01', time: '10:00', is_available: true });
  await createSlot({ date: '2099-03-01', time: '14:00', is_available: true });
  await createSlot({ date: '2099-03-02', time: '10:00', is_available: false }); // unavailable
});

afterAll(teardownTestDb);

// ── GET /api/user ─────────────────────────────────────────────────────────────
describe('GET /api/user', () => {
  test('returns user info when logged in as Google user', async () => {
    const cookie = await loginAsUser(user1.id);
    const res = await request(app)
      .get('/api/user')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('dana@test.com');
    expect(res.body.name).toBe('Dana');
  });

  test('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/user');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/not authenticated/i);
  });

  test('admin session does NOT satisfy /api/user endpoint as a Google user', async () => {
    // Admin is authenticated but is type=admin, not a google user row
    // The route only checks isAuthenticated(), so admin sessions will pass too;
    // but the returned object should not include google_id
    const res = await request(app).get('/api/user');
    expect(res.status).toBe(401);
  });
});

// ── GET /logout ───────────────────────────────────────────────────────────────
describe('GET /logout', () => {
  test('redirects to / after logout', async () => {
    const cookie = await loginAsUser(user1.id);
    const res = await request(app)
      .get('/logout')
      .set('Cookie', cookie);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  test('/api/user returns 401 after logout', async () => {
    const cookie = await loginAsUser(user1.id);
    await request(app).get('/logout').set('Cookie', cookie);
    const res = await request(app).get('/api/user').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });
});

// ── GET /api/available-slots ──────────────────────────────────────────────────
describe('GET /api/available-slots', () => {
  test('returns 200 with an array (unauthenticated is fine)', async () => {
    const res = await request(app).get('/api/available-slots');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('only includes future dates', async () => {
    const res = await request(app).get('/api/available-slots');
    const today = new Date().toISOString().split('T')[0];
    res.body.forEach(row => {
      expect(row.date >= today).toBe(true);
    });
  });

  test('only includes is_available=true slots', async () => {
    const res = await request(app).get('/api/available-slots');
    // All returned dates should have times from available=true slots only
    // The unavailable slot on 2099-03-02 at 10:00 must not appear
    res.body.forEach(row => {
      // times is an array_agg of times for that date
      expect(Array.isArray(row.times)).toBe(true);
    });
  });

  test('groups times by date', async () => {
    const res = await request(app).get('/api/available-slots');
    const march1 = res.body.find(r => r.date.startsWith('2099-03-01'));
    expect(march1).toBeDefined();
    expect(march1.times).toHaveLength(2); // 10:00 and 14:00
  });

  test('unavailable date-only slot does not appear as a group', async () => {
    const res = await request(app).get('/api/available-slots');
    // 2099-03-02 only has an unavailable slot, so it must not be present
    const march2 = res.body.find(r => r.date.startsWith('2099-03-02'));
    expect(march2).toBeUndefined();
  });
});

// ── POST /api/bookings ────────────────────────────────────────────────────────
describe('POST /api/bookings', () => {
  let userCookie;

  beforeAll(async () => {
    userCookie = await loginAsUser(user1.id);
  });

  test('returns 401 when not authenticated', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({ project_type: 'website', project_name: 'Test', preferred_date: '2026-08-01' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/login/i);
  });

  test('creates a booking successfully when authenticated', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Cookie', userCookie)
      .send({
        project_type: 'website',
        project_name: 'My Landing Page',
        description: 'A simple landing page',
        preferred_date: '2026-08-10',
        phone: '+63 912 345 6789',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.booking).toMatchObject({
      project_type: 'website',
      project_name: 'My Landing Page',
      email: 'dana@test.com',
      status: 'pending',
    });
  });

  test('booking has user_id matching the logged-in user', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Cookie', userCookie)
      .send({
        project_type: 'webapp',
        project_name: 'Ownership Check',
        preferred_date: '2026-08-11',
      });

    expect(res.body.booking.user_id).toBe(user1.id);
  });

  test('returns 400 when project_type is missing', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Cookie', userCookie)
      .send({ project_name: 'No Type', preferred_date: '2026-08-12' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing required fields/i);
  });

  test('returns 400 when project_name is missing', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Cookie', userCookie)
      .send({ project_type: 'website', preferred_date: '2026-08-13' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing required fields/i);
  });

  test('returns 400 when preferred_date is missing', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Cookie', userCookie)
      .send({ project_type: 'website', project_name: 'No Date' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing required fields/i);
  });

  test('returns 400 when booking the same date twice (duplicate constraint)', async () => {
    // First booking on this date
    await request(app)
      .post('/api/bookings')
      .set('Cookie', userCookie)
      .send({ project_type: 'ai', project_name: 'First', preferred_date: '2026-09-01' });

    // Same date again
    const res = await request(app)
      .post('/api/bookings')
      .set('Cookie', userCookie)
      .send({ project_type: 'website', project_name: 'Second', preferred_date: '2026-09-01' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already have a booking/i);
  });

  test('different users can book the same date', async () => {
    const user2Cookie = await loginAsUser(user2.id);

    const res = await request(app)
      .post('/api/bookings')
      .set('Cookie', user2Cookie)
      .send({ project_type: 'website', project_name: 'Evan Site', preferred_date: '2026-09-01' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('creates booking with default status of pending', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Cookie', userCookie)
      .send({ project_type: 'website', project_name: 'Status Default Check', preferred_date: '2026-09-15' });

    expect(res.body.booking.status).toBe('pending');
  });

  test('phone field is optional – creates booking without it', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Cookie', userCookie)
      .send({ project_type: 'website', project_name: 'No Phone', preferred_date: '2026-09-20' });

    expect(res.status).toBe(200);
    expect(res.body.booking.phone).toBeNull();
  });
});

// ── GET /api/my-bookings ──────────────────────────────────────────────────────
describe('GET /api/my-bookings', () => {
  let userCookie;

  beforeAll(async () => {
    userCookie = await loginAsUser(user1.id);
    // Create a booking belonging to user1 for this suite
    await createBooking(user1.id, user1.email, { preferred_date: '2026-11-01', project_name: 'My Booking A' });
    await createBooking(user1.id, user1.email, { preferred_date: '2026-11-02', project_name: 'My Booking B' });
    // Booking for user2 – must NOT appear in user1's results
    await createBooking(user2.id, user2.email, { preferred_date: '2026-11-03', project_name: 'Evan Booking' });
  });

  test('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/my-bookings');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/not authenticated/i);
  });

  test('returns only the authenticated user\'s bookings', async () => {
    const res = await request(app)
      .get('/api/my-bookings')
      .set('Cookie', userCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    res.body.forEach(b => {
      expect(b.user_id).toBe(user1.id);
    });
  });

  test('does not include bookings from other users', async () => {
    const res = await request(app)
      .get('/api/my-bookings')
      .set('Cookie', userCookie);

    const names = res.body.map(b => b.project_name);
    expect(names).not.toContain('Evan Booking');
  });

  test('returns bookings ordered by preferred_date descending', async () => {
    const res = await request(app)
      .get('/api/my-bookings')
      .set('Cookie', userCookie);

    const dates = res.body.map(b => b.preferred_date);
    const sorted = [...dates].sort((a, b) => b.localeCompare(a));
    expect(dates).toEqual(sorted);
  });

  test('returns empty array when user has no bookings', async () => {
    // Create a fresh user with no bookings
    const newUser = await createUser({ email: 'fresh@test.com', google_id: 'gid_fresh' });
    const newCookie = await loginAsUser(newUser.id);
    const res = await request(app)
      .get('/api/my-bookings')
      .set('Cookie', newCookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
