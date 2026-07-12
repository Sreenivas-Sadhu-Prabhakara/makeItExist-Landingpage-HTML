const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();

// Trust Vercel's proxy so secure cookies are set correctly behind HTTPS
app.set('trust proxy', 1);

// Neon DB Connection Pool (declared early so the session store can reuse it)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve the static front-end (index/solutions/team/booking/admin + assets).
// On Vercel these are served from the CDN via vercel.json; this covers local dev.
app.use(express.static(path.join(__dirname)));

// Session setup — persisted in Postgres so sessions survive serverless invocations
const PgSession = require('connect-pg-simple')(session);
app.use(session({
  store: new PgSession({ pool, tableName: 'session', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

// Passport setup
app.use(passport.initialize());
app.use(passport.session());

// Initialize database tables
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        google_id VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        picture VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE SET NULL,
        full_name VARCHAR(255),
        project_type VARCHAR(100),
        project_name VARCHAR(255),
        description TEXT,
        preferred_date DATE,
        slot_id INT,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS available_slots (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        time TIME NOT NULL,
        is_available BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, time)
      );
    `);

    // Admin users table (local username/password auth)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        display_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed the default admin user if not already present
    const adminExists = await pool.query(
      'SELECT id FROM admin_users WHERE username = $1',
      ['makeit_exist_admin']
    );
    if (adminExists.rows.length === 0) {
      const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'WHEREthereiswill1#', 12);
      await pool.query(
        'INSERT INTO admin_users (username, password_hash, display_name) VALUES ($1, $2, $3)',
        ['makeit_exist_admin', hash, 'MakeItExist Admin']
      );
      console.log('✅ Admin user seeded');
    }

    console.log('✅ Database tables initialized');
  } catch (err) {
    console.error('❌ Database initialization error:', err);
  }
}

// Initialize database tables — exported as a promise so tests can await it
const dbReady = initializeDatabase();

// Google OAuth Strategy
passport.use('google', new GoogleStrategy({
    clientID: process.env.VITE_GOOGLE_CLIENT_ID,
    clientSecret: process.env.VITE_GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if user exists
      let user = await pool.query(
        'SELECT * FROM users WHERE google_id = $1',
        [profile.id]
      );

      if (user.rows.length === 0) {
        // Create new user
        user = await pool.query(
          'INSERT INTO users (google_id, email, name, picture) VALUES ($1, $2, $3, $4) RETURNING *',
          [profile.id, profile.emails[0].value, profile.displayName, profile.photos[0]?.value]
        );
      }

      return done(null, { ...user.rows[0], type: 'google' });
    } catch (err) {
      return done(err);
    }
  }
));

// Admin Local Strategy
passport.use('admin-local', new LocalStrategy(
  { usernameField: 'username', passwordField: 'password' },
  async (username, password, done) => {
    try {
      const result = await pool.query(
        'SELECT * FROM admin_users WHERE username = $1',
        [username]
      );
      if (result.rows.length === 0) {
        return done(null, false, { message: 'Invalid credentials' });
      }
      const admin = result.rows[0];
      const match = await bcrypt.compare(password, admin.password_hash);
      if (!match) {
        return done(null, false, { message: 'Invalid credentials' });
      }
      return done(null, { ...admin, type: 'admin' });
    } catch (err) {
      return done(err);
    }
  }
));

passport.serializeUser((user, done) => {
  // Encode both type and id so we can look up the right table
  done(null, `${user.type}:${user.id}`);
});

passport.deserializeUser(async (key, done) => {
  try {
    // Support both new "type:id" format and legacy plain numeric id from old sessions
    const parts = String(key).split(':');
    let type, id;
    if (parts.length === 2) {
      [type, id] = parts;
    } else {
      // Legacy session key — treat as a Google user id
      type = 'google';
      id = parts[0];
    }

    if (type === 'admin') {
      const result = await pool.query('SELECT * FROM admin_users WHERE id = $1', [id]);
      done(null, result.rows[0] ? { ...result.rows[0], type: 'admin' } : null);
    } else {
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      done(null, result.rows[0] ? { ...result.rows[0], type: 'google' } : null);
    }
  } catch (err) {
    done(err);
  }
});

// Routes

// Google Auth
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login-failed' }),
  (req, res) => {
    res.redirect('/booking.html?success=true');
  }
);

// Get current user
app.get('/api/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json(req.user);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Get current session info
app.get('/api/session', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      authenticated: true,
      user: req.user,
      type: req.user.type
    });
  } else {
    res.json({
      authenticated: false
    });
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.redirect('/');
  });
});

// Get available dates and times
app.get('/api/available-slots', async (req, res) => {
  try {
    const slots = await pool.query(
      `SELECT date::text AS date, array_agg(time::text ORDER BY time) as times 
       FROM available_slots 
       WHERE is_available = true AND date >= CURRENT_DATE
       GROUP BY date 
       ORDER BY date 
       LIMIT 60`
    );
    res.json(slots.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch slots', details: err.message });
  }
});

// Get slots for a specific date
app.get('/api/slots', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'Date parameter is required' });
    }
    
    const slots = await pool.query(
      `SELECT id, date::text, time, is_available
       FROM available_slots 
       WHERE date = $1 AND is_available = true
       ORDER BY time`,
      [date]
    );
    res.json(slots.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch slots', details: err.message });
  }
});

// Create booking (supports both authenticated and unauthenticated users)
app.post('/api/bookings', async (req, res) => {
  const { fullName, email, phone, slotId, projectType, projectName, description, notes } = req.body;

  // Support both old format and new slot-based format
  const finalEmail = email || (req.isAuthenticated() ? req.user.email : null);
  const finalName = fullName || (req.isAuthenticated() ? req.user.name : null);
  const finalPhone = phone || '';
  const finalProjectType = projectType || 'web';
  const finalProjectName = projectName || '';
  const finalDescription = description || notes || '';

  if (!finalEmail || !slotId) {
    return res.status(400).json({ error: 'Email and slot ID are required' });
  }

  try {
    // Get slot info to get the date
    const slotResult = await pool.query(
      'SELECT id, date FROM available_slots WHERE id = $1',
      [slotId]
    );
    
    if (slotResult.rows.length === 0) {
      return res.status(404).json({ error: 'Slot not found' });
    }

    const slotDate = slotResult.rows[0].date;
    const userId = req.isAuthenticated() ? req.user.id : null;

    // Create booking
    const booking = await pool.query(
      `INSERT INTO bookings (user_id, full_name, email, phone, slot_id, preferred_date, project_type, project_name, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
       RETURNING *`,
      [userId, finalName, finalEmail, finalPhone, slotId, slotDate, finalProjectType, finalProjectName, finalDescription]
    );

    // Mark slot as unavailable
    await pool.query(
      'UPDATE available_slots SET is_available = false WHERE id = $1',
      [slotId]
    );

    res.status(201).json({ success: true, booking: booking.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create booking', details: err.message });
  }
});

// Get user bookings
app.get('/api/my-bookings', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const bookings = await pool.query(
      'SELECT * FROM bookings WHERE user_id = $1 ORDER BY preferred_date DESC',
      [req.user.id]
    );
    res.json(bookings.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bookings', details: err.message });
  }
});

// ─── Admin Middleware ─────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.type === 'admin') return next();
  res.status(403).json({ error: 'Admin access required' });
}

// Admin Login (POST /admin/login)
app.post('/admin/login', (req, res, next) => {
  passport.authenticate('admin-local', (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.status(401).json({ error: info?.message || 'Invalid credentials' });
    req.logIn(user, (err) => {
      if (err) return next(err);
      res.json({ success: true, admin: { id: user.id, username: user.username, display_name: user.display_name } });
    });
  })(req, res, next);
});

// Admin Logout
app.get('/admin/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.redirect('/admin.html');
  });
});

// Admin – current session info
app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, display_name: req.user.display_name });
});

// Admin – get ALL bookings (with user info)
app.get('/api/admin/bookings', requireAdmin, async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = `
      SELECT b.*, u.name AS user_name, u.email AS user_email, u.picture AS user_picture
      FROM bookings b
      JOIN users u ON b.user_id = u.id
    `;
    const params = [];
    const conditions = [];

    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`b.status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(u.name ILIKE $${params.length} OR b.project_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY b.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bookings', details: err.message });
  }
});

// Admin – update booking status
app.patch('/api/admin/bookings/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  const allowed = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    const result = await pool.query(
      'UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    res.json({ success: true, booking: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update booking status', details: err.message });
  }
});

// Admin – update user info (name, email, etc.)
app.patch('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const { name, email, picture } = req.body;
  try {
    const result = await pool.query(
      `UPDATE users SET name = $1, email = $2, picture = $3 WHERE id = $4 RETURNING *`,
      [name, email, picture, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user info', details: err.message });
  }
});

// Admin – delete a booking
app.delete('/api/admin/bookings/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM bookings WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    res.json({ success: true, booking: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete booking', details: err.message });
  }
});

// Admin – delete a user
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user', details: err.message });
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date() });
  } catch (err) {
    res.status(500).json({ error: 'Database connection failed', details: err.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server (only when run directly — Vercel imports the app instead of listening)
if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

module.exports = app;
