'use strict';

/**
 * Admin Stats API Tests
 * Covers: GET /api/admin/stats
 */

const request = require('supertest');
const {
  app,
  setupTestDb, teardownTestDb,
  createUser, createBooking, createSlot,
  loginAsAdmin, loginAsUser,
} = require('./helpers');

let adminCookie;
let user;

beforeAll(async () => {
  await setupTestDb();
  adminCookie = await loginAsAdmin();
  user = await createUser({ email: 'stats@test.com', google_id: 'gid_stats' });

  // Create a known set of bookings across each status
  await createBooking(user.id, user.email, { preferred_date: '2026-07-01', status: 'pending' });
  await createBooking(user.id, user.email, { preferred_date: '2026-07-02', status: 'pending' });
  await createBooking(user.id, user.email, { preferred_date: '2026-07-03', status: 'confirmed' });
  await createBooking(user.id, user.email, { preferred_date: '2026-07-04', status: 'in_progress' });
  await createBooking(user.id, user.email, { preferred_date: '2026-07-05', status: 'completed' });
  await createBooking(user.id, user.email, { preferred_date: '2026-07-06', status: 'cancelled' });

  // Create future available slots (date must be >= today for available_slots count)
  await createSlot({ date: '2099-01-01', time: '10:00', is_available: true });
  await createSlot({ date: '2099-01-02', time: '14:00', is_available: true });
  await createSlot({ date: '2099-01-03', time: '10:00', is_available: false }); // should NOT count
});

afterAll(teardownTestDb);

describe('GET /api/admin/stats', () => {
  test('returns 403 when not authenticated', async () => {
    const res = await request(app).get('/api/admin/stats');
    expect(res.status).toBe(403);
  });

  test('returns 403 for a regular Google user', async () => {
    const userCookie = await loginAsUser(user.id);
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Cookie', userCookie);
    expect(res.status).toBe(403);
  });

  test('returns 200 with correct structure', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('bookings');
    expect(res.body).toHaveProperty('users');
    expect(res.body).toHaveProperty('available_slots');

    const { bookings } = res.body;
    expect(bookings).toHaveProperty('total');
    expect(bookings).toHaveProperty('pending');
    expect(bookings).toHaveProperty('confirmed');
    expect(bookings).toHaveProperty('in_progress');
    expect(bookings).toHaveProperty('completed');
    expect(bookings).toHaveProperty('cancelled');
  });

  test('counts correct total bookings', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Cookie', adminCookie);

    expect(res.body.bookings.total).toBe(6);
  });

  test('counts correct pending bookings', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Cookie', adminCookie);

    expect(res.body.bookings.pending).toBe(2);
  });

  test('counts correct confirmed bookings', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Cookie', adminCookie);

    expect(res.body.bookings.confirmed).toBe(1);
  });

  test('counts correct in_progress bookings', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Cookie', adminCookie);

    expect(res.body.bookings.in_progress).toBe(1);
  });

  test('counts correct completed bookings', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Cookie', adminCookie);

    expect(res.body.bookings.completed).toBe(1);
  });

  test('counts correct cancelled bookings', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Cookie', adminCookie);

    expect(res.body.bookings.cancelled).toBe(1);
  });

  test('total equals sum of all status counts', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Cookie', adminCookie);

    const { total, pending, confirmed, in_progress, completed, cancelled } = res.body.bookings;
    expect(total).toBe(pending + confirmed + in_progress + completed + cancelled);
  });

  test('counts correct number of users', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Cookie', adminCookie);

    expect(res.body.users).toBeGreaterThanOrEqual(1);
  });

  test('counts only AVAILABLE future slots', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Cookie', adminCookie);

    // We inserted 2 available future slots + 1 unavailable
    expect(res.body.available_slots).toBe(2);
  });

  test('all stat values are integers', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Cookie', adminCookie);

    const { bookings, users, available_slots } = res.body;
    Object.values(bookings).forEach(v => expect(Number.isInteger(v)).toBe(true));
    expect(Number.isInteger(users)).toBe(true);
    expect(Number.isInteger(available_slots)).toBe(true);
  });
});
