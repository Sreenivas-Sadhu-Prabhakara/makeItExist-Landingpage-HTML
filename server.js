const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? 'your-domain.com' : 'http://localhost:3000',
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, sameSite: 'lax' }
}));

// Passport setup
app.use(passport.initialize());
app.use(passport.session());

// Neon DB Connection Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

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
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_type VARCHAR(100) NOT NULL,
        project_name VARCHAR(255) NOT NULL,
        description TEXT,
        preferred_date DATE NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, preferred_date)
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

    console.log('✅ Database tables initialized');
  } catch (err) {
    console.error('❌ Database initialization error:', err);
  }
}

initializeDatabase();

// Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.VITE_GOOGLE_CLIENT_ID,
    clientSecret: process.env.VITE_GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback'
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

      return done(null, user.rows[0]);
    } catch (err) {
      return done(err);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, user.rows[0]);
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
      `SELECT date, array_agg(time ORDER BY time) as times 
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

// Create booking
app.post('/api/bookings', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Please login first' });
  }

  const { project_type, project_name, description, preferred_date, phone } = req.body;

  if (!project_type || !project_name || !preferred_date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const booking = await pool.query(
      `INSERT INTO bookings (user_id, project_type, project_name, description, preferred_date, email, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, project_type, project_name, description, preferred_date, req.user.email, phone]
    );

    res.json({ success: true, booking: booking.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'You already have a booking for this date. Please choose another date.' });
    }
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

// Serve static files
app.use(express.static('.'));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
