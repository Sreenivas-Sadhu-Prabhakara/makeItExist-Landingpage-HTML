'use strict';

/**
 * Admin Slots API Tests
 * Covers: GET /api/admin/slots, POST /api/admin/slots,
 *         PATCH /api/admin/slots/:id/toggle, DELETE /api/admin/slots/:id
 */

const request = require('supertest');
const {
  app,
  setupTestDb, teardownTestDb,
  createSlot,
  loginAsAdmin, loginAsUser, createUser,
} = require('./helpers');

let adminCookie;
let user;

beforeAll(async () => {
  await setupTestDb();
  adminCookie = await loginAsAdmin();
  user = await createUser({ email: 'charlie@test.com', google_id: 'gid_charlie' });
});

afterAll(teardownTestDb);

// ── GET /api/admin/slots ──────────────────────────────────────────────────────
describe('GET /api/admin/slots', () => {
  let slot1, slot2;

  beforeAll(async () => {
    slot1 = await createSlot({ date: '2026-08-01', time: '10:00', is_available: true });
    slot2 = await createSlot({ date: '2026-08-01', time: '14:00', is_available: false });
  });

  test('returns all slots for an authenticated admin', async () => {
    const res = await request(app)
      .get('/api/admin/slots')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = res.body.map(s => s.id);
    expect(ids).toContain(slot1.id);
    expect(ids).toContain(slot2.id);
  });

  test('includes both available and unavailable slots', async () => {
    const res = await request(app)
      .get('/api/admin/slots')
      .set('Cookie', adminCookie);

    const avail = res.body.map(s => s.is_available);
    expect(avail).toContain(true);
    expect(avail).toContain(false);
  });

  test('returns 403 when not authenticated', async () => {
    const res = await request(app).get('/api/admin/slots');
    expect(res.status).toBe(403);
  });

  test('returns 403 for a regular Google user', async () => {
    const userCookie = await loginAsUser(user.id);
    const res = await request(app)
      .get('/api/admin/slots')
      .set('Cookie', userCookie);
    expect(res.status).toBe(403);
  });
});

// ── POST /api/admin/slots ─────────────────────────────────────────────────────
describe('POST /api/admin/slots', () => {
  test('creates a new slot successfully', async () => {
    const res = await request(app)
      .post('/api/admin/slots')
      .set('Cookie', adminCookie)
      .send({ date: '2026-09-05', time: '18:00' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.slot).toMatchObject({ is_available: true });
    expect(res.body.slot.id).toBeDefined();
  });

  test('new slot appears in GET /api/admin/slots', async () => {
    await request(app)
      .post('/api/admin/slots')
      .set('Cookie', adminCookie)
      .send({ date: '2026-09-06', time: '10:00' });

    const res = await request(app)
      .get('/api/admin/slots')
      .set('Cookie', adminCookie);

    const times = res.body.map(s => s.time.slice(0, 5));
    expect(times).toContain('10:00');
  });

  test('returns 400 when date is missing', async () => {
    const res = await request(app)
      .post('/api/admin/slots')
      .set('Cookie', adminCookie)
      .send({ time: '10:00' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/date and time/i);
  });

  test('returns 400 when time is missing', async () => {
    const res = await request(app)
      .post('/api/admin/slots')
      .set('Cookie', adminCookie)
      .send({ date: '2026-09-07' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/date and time/i);
  });

  test('returns 400 when both fields are missing', async () => {
    const res = await request(app)
      .post('/api/admin/slots')
      .set('Cookie', adminCookie)
      .send({});

    expect(res.status).toBe(400);
  });

  test('handles duplicate slot gracefully (ON CONFLICT DO NOTHING)', async () => {
    await request(app)
      .post('/api/admin/slots')
      .set('Cookie', adminCookie)
      .send({ date: '2026-09-10', time: '09:00' });

    // Same date+time again
    const res = await request(app)
      .post('/api/admin/slots')
      .set('Cookie', adminCookie)
      .send({ date: '2026-09-10', time: '09:00' });

    // Should succeed but slot is null (no row returned for duplicate)
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.slot).toBeNull();
  });

  test('returns 403 when not authenticated', async () => {
    const res = await request(app)
      .post('/api/admin/slots')
      .send({ date: '2026-09-20', time: '10:00' });
    expect(res.status).toBe(403);
  });

  test('returns 403 for a regular Google user', async () => {
    const userCookie = await loginAsUser(user.id);
    const res = await request(app)
      .post('/api/admin/slots')
      .set('Cookie', userCookie)
      .send({ date: '2026-09-21', time: '10:00' });
    expect(res.status).toBe(403);
  });
});

// ── PATCH /api/admin/slots/:id/toggle ────────────────────────────────────────
describe('PATCH /api/admin/slots/:id/toggle', () => {
  let slot;
  let toggleCounter = 0;

  beforeEach(async () => {
    toggleCounter++;
    slot = await createSlot({ date: `2026-10-${String(toggleCounter).padStart(2,'0')}`, time: '11:00', is_available: true });
  });

  test('toggles slot from available to unavailable', async () => {
    const res = await request(app)
      .patch(`/api/admin/slots/${slot.id}/toggle`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.slot.is_available).toBe(false);
  });

  test('toggling twice restores original availability', async () => {
    await request(app)
      .patch(`/api/admin/slots/${slot.id}/toggle`)
      .set('Cookie', adminCookie);

    const res = await request(app)
      .patch(`/api/admin/slots/${slot.id}/toggle`)
      .set('Cookie', adminCookie);

    expect(res.body.slot.is_available).toBe(true);
  });

  test('returns 404 for non-existent slot id', async () => {
    const res = await request(app)
      .patch('/api/admin/slots/999999/toggle')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('returns 403 when not authenticated', async () => {
    const res = await request(app)
      .patch(`/api/admin/slots/${slot.id}/toggle`);
    expect(res.status).toBe(403);
  });

  test('returns 403 for a regular Google user', async () => {
    const userCookie = await loginAsUser(user.id);
    const res = await request(app)
      .patch(`/api/admin/slots/${slot.id}/toggle`)
      .set('Cookie', userCookie);
    expect(res.status).toBe(403);
  });
});

// ── DELETE /api/admin/slots/:id ───────────────────────────────────────────────
describe('DELETE /api/admin/slots/:id', () => {
  let slot;
  let deleteCounter = 0;

  beforeEach(async () => {
    deleteCounter++;
    slot = await createSlot({ date: `2026-11-${String(deleteCounter).padStart(2,'0')}`, time: '09:00' });
  });

  test('deletes an existing slot successfully', async () => {
    const res = await request(app)
      .delete(`/api/admin/slots/${slot.id}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('deleted slot no longer appears in slot list', async () => {
    await request(app)
      .delete(`/api/admin/slots/${slot.id}`)
      .set('Cookie', adminCookie);

    const res = await request(app)
      .get('/api/admin/slots')
      .set('Cookie', adminCookie);

    const ids = res.body.map(s => s.id);
    expect(ids).not.toContain(slot.id);
  });

  test('returns 200 for non-existent slot (idempotent delete)', async () => {
    const res = await request(app)
      .delete('/api/admin/slots/999999')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('returns 403 when not authenticated', async () => {
    const res = await request(app)
      .delete(`/api/admin/slots/${slot.id}`);
    expect(res.status).toBe(403);
  });

  test('returns 403 for a regular Google user', async () => {
    const userCookie = await loginAsUser(user.id);
    const res = await request(app)
      .delete(`/api/admin/slots/${slot.id}`)
      .set('Cookie', userCookie);
    expect(res.status).toBe(403);
  });
});
