'use strict';

/**
 * Admin Bookings API Tests
 * Covers: GET /api/admin/bookings, PATCH /api/admin/bookings/:id/status,
 *         DELETE /api/admin/bookings/:id
 */

const request = require('supertest');
const {
  app, pool,
  setupTestDb, teardownTestDb,
  createUser, createBooking,
  loginAsAdmin, loginAsUser,
} = require('./helpers');

let adminCookie;
let user1, user2;
let booking1, booking2, booking3;

beforeAll(async () => {
  await setupTestDb();
  adminCookie = await loginAsAdmin();

  // Create two Google users
  user1 = await createUser({ email: 'alice@test.com', name: 'Alice', google_id: 'gid_alice' });
  user2 = await createUser({ email: 'bob@test.com',   name: 'Bob',   google_id: 'gid_bob'   });

  // Create bookings with various statuses
  booking1 = await createBooking(user1.id, user1.email, {
    project_name: 'Club Portal',
    project_type: 'webapp',
    preferred_date: '2026-07-05',
    status: 'pending',
  });
  booking2 = await createBooking(user1.id, user1.email, {
    project_name: 'Analytics Dashboard',
    project_type: 'ai',
    preferred_date: '2026-07-12',
    status: 'confirmed',
  });
  booking3 = await createBooking(user2.id, user2.email, {
    project_name: 'Event Site',
    project_type: 'website',
    preferred_date: '2026-07-19',
    status: 'completed',
  });
});

afterAll(teardownTestDb);

// ── GET /api/admin/bookings ───────────────────────────────────────────────────
describe('GET /api/admin/bookings', () => {
  test('returns all bookings with user info when admin is authenticated', async () => {
    const res = await request(app)
      .get('/api/admin/bookings')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(3);

    const names = res.body.map(b => b.project_name);
    expect(names).toContain('Club Portal');
    expect(names).toContain('Analytics Dashboard');
    expect(names).toContain('Event Site');
  });

  test('each booking includes user_name and user_email', async () => {
    const res = await request(app)
      .get('/api/admin/bookings')
      .set('Cookie', adminCookie);

    const b = res.body.find(x => x.project_name === 'Club Portal');
    expect(b.user_name).toBe('Alice');
    expect(b.user_email).toBe('alice@test.com');
  });

  test('returns 403 when not authenticated', async () => {
    const res = await request(app).get('/api/admin/bookings');
    expect(res.status).toBe(403);
  });

  test('returns 403 for a regular Google user', async () => {
    const userCookie = await loginAsUser(user1.id);
    const res = await request(app)
      .get('/api/admin/bookings')
      .set('Cookie', userCookie);
    expect(res.status).toBe(403);
  });

  // Filtering by status
  test('filters bookings by status=pending', async () => {
    const res = await request(app)
      .get('/api/admin/bookings?status=pending')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.every(b => b.status === 'pending')).toBe(true);
  });

  test('filters bookings by status=confirmed', async () => {
    const res = await request(app)
      .get('/api/admin/bookings?status=confirmed')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.every(b => b.status === 'confirmed')).toBe(true);
  });

  test('filters bookings by status=completed', async () => {
    const res = await request(app)
      .get('/api/admin/bookings?status=completed')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.every(b => b.status === 'completed')).toBe(true);
  });

  test('returns all bookings when status=all', async () => {
    const res = await request(app)
      .get('/api/admin/bookings?status=all')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
  });

  // Filtering by search
  test('searches bookings by project name', async () => {
    const res = await request(app)
      .get('/api/admin/bookings?search=portal')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].project_name).toBe('Club Portal');
  });

  test('searches bookings by user name (case-insensitive)', async () => {
    const res = await request(app)
      .get('/api/admin/bookings?search=alice')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.every(b => b.user_name === 'Alice')).toBe(true);
  });

  test('searches bookings by email', async () => {
    const res = await request(app)
      .get('/api/admin/bookings?search=bob@test.com')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].user_email).toBe('bob@test.com');
  });

  test('returns empty array for unmatched search', async () => {
    const res = await request(app)
      .get('/api/admin/bookings?search=zzznomatch999')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  test('combines status and search filters', async () => {
    const res = await request(app)
      .get('/api/admin/bookings?status=pending&search=club')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].project_name).toBe('Club Portal');
  });
});

// ── PATCH /api/admin/bookings/:id/status ─────────────────────────────────────
describe('PATCH /api/admin/bookings/:id/status', () => {
  test('updates booking status to confirmed', async () => {
    const res = await request(app)
      .patch(`/api/admin/bookings/${booking1.id}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'confirmed' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.booking.status).toBe('confirmed');
    expect(res.body.booking.id).toBe(booking1.id);
  });

  test('updates booking status to in_progress', async () => {
    const res = await request(app)
      .patch(`/api/admin/bookings/${booking1.id}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'in_progress' });

    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('in_progress');
  });

  test('updates booking status to completed', async () => {
    const res = await request(app)
      .patch(`/api/admin/bookings/${booking1.id}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('completed');
  });

  test('updates booking status to cancelled', async () => {
    const res = await request(app)
      .patch(`/api/admin/bookings/${booking1.id}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('cancelled');
  });

  test('updates booking status back to pending', async () => {
    const res = await request(app)
      .patch(`/api/admin/bookings/${booking1.id}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'pending' });

    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('pending');
  });

  test('returns 400 for invalid status value', async () => {
    const res = await request(app)
      .patch(`/api/admin/bookings/${booking1.id}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'launched' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid status/i);
  });

  test('returns 404 for a non-existent booking id', async () => {
    const res = await request(app)
      .patch('/api/admin/bookings/999999/status')
      .set('Cookie', adminCookie)
      .send({ status: 'confirmed' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('returns 403 when not authenticated', async () => {
    const res = await request(app)
      .patch(`/api/admin/bookings/${booking1.id}/status`)
      .send({ status: 'confirmed' });
    expect(res.status).toBe(403);
  });

  test('returns 403 for a regular Google user', async () => {
    const userCookie = await loginAsUser(user1.id);
    const res = await request(app)
      .patch(`/api/admin/bookings/${booking1.id}/status`)
      .set('Cookie', userCookie)
      .send({ status: 'confirmed' });
    expect(res.status).toBe(403);
  });
});

// ── DELETE /api/admin/bookings/:id ────────────────────────────────────────────
describe('DELETE /api/admin/bookings/:id', () => {
  test('returns 403 when not authenticated', async () => {
    const res = await request(app)
      .delete(`/api/admin/bookings/${booking3.id}`);
    expect(res.status).toBe(403);
  });

  test('returns 403 for a regular Google user', async () => {
    const userCookie = await loginAsUser(user1.id);
    const res = await request(app)
      .delete(`/api/admin/bookings/${booking3.id}`)
      .set('Cookie', userCookie);
    expect(res.status).toBe(403);
  });

  test('deletes an existing booking successfully', async () => {
    const res = await request(app)
      .delete(`/api/admin/bookings/${booking3.id}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('deleted booking no longer appears in bookings list', async () => {
    const res = await request(app)
      .get('/api/admin/bookings')
      .set('Cookie', adminCookie);

    const ids = res.body.map(b => b.id);
    expect(ids).not.toContain(booking3.id);
  });

  test('deleting a non-existent booking still returns 200 (idempotent)', async () => {
    const res = await request(app)
      .delete('/api/admin/bookings/999999')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
