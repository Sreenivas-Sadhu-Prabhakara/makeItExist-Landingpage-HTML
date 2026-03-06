# 🚀 Make It Exist - Complete Setup Guide

## What's New

Your Make It Exist landing page now has a **full-featured booking system** with:

✨ **Google OAuth Login** - Users sign in with Gmail  
📅 **Calendar Booking** - Select preferred weekend for sprint  
💾 **Neon PostgreSQL** - Secure credential & booking storage  
🎨 **Responsive UI** - Beautiful dark mode support  
🔐 **Session Management** - Secure authenticated sessions  

## Quick Start (5 minutes)

### Step 1: Get Google OAuth Credentials

1. Visit [Google Cloud Console](https://console.cloud.google.com)
2. Create new project: "Make It Exist"
3. Enable "Google+ API"
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Application type: **Web application**
6. Authorized JavaScript origins:
   - `http://localhost:3000`
   - `http://localhost:3000`
7. Authorized redirect URIs:
   - `http://localhost:3000/auth/google/callback`
   - Add production domain when deployed
8. Copy: **Client ID** and **Client Secret**

### Step 2: Create Neon Database

1. Visit [neon.tech](https://neon.tech)
2. Sign up with GitHub/Google
3. Create new project
4. Create database (default name: neondb)
5. Copy connection string: `postgresql://user:password@host/database`

### Step 3: Configure Environment

Create `.env` file in project root:

```
VITE_GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
VITE_GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
DATABASE_URL=postgresql://user:password@host/database
SESSION_SECRET=your_random_secret_here
PORT=3000
NODE_ENV=development
```

Generate a random secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 4: Install & Run

```bash
# Install dependencies
npm install

# Start server
npm run dev
# or: npm start

# In another terminal, initialize sprint slots
node init-slots.js
```

Visit: **http://localhost:3000/booking.html**

## File Structure

```
makeItExist-Landingpage-HTML/
├── 📄 index.html              (Home page)
├── 📄 solutions.html          (Services/tiers)
├── 📄 team.html               (Team info)
├── 📄 booking.html            (✨ NEW - Booking page)
├── 🔧 server.js               (✨ NEW - Express backend)
├── 📦 package.json            (✨ NEW - Dependencies)
├── .env.example               (✨ NEW - Config template)
├── 🌱 init-slots.js           (✨ NEW - Initialize dates)
├── 📋 BOOKING_SETUP.md        (✨ NEW - Full setup guide)
├── 🏗️ ARCHITECTURE.md          (✨ NEW - Technical details)
├── 🎯 THIS_FILE.md            (Quick reference)
└── assets/                    (Images & logos)
```

## Pages Overview

| Page | Path | Purpose |
|------|------|---------|
| Home | `/` (index.html) | Landing page & overview |
| Services | `/solutions.html` | Project tiers & pricing |
| Team | `/team.html` | Who we are & how we work |
| **Booking** | **`/booking.html`** | **✨ NEW - Reserve a sprint** |

## How It Works

### For Users

```
1. Click "Book Now" button
   ↓
2. Sign in with Google (one-click login)
   ↓
3. Select project tier (Website / App / AI)
   ↓
4. Enter project details
   ↓
5. Pick a weekend from calendar
   ↓
6. Confirm booking
   ↓
7. Receive confirmation email
   ↓
8. Sprint begins Friday evening!
```

### For Admin (tracking)

```bash
# View all bookings
SELECT * FROM bookings ORDER BY preferred_date DESC;

# View user accounts
SELECT * FROM users;

# Check available slots
SELECT date, COUNT(*) as available_times 
FROM available_slots 
WHERE is_available = true 
GROUP BY date 
ORDER BY date;

# Mark slot as unavailable
UPDATE available_slots 
SET is_available = false 
WHERE date = '2026-03-14' AND time = '18:00';
```

## Database Tables

### users
- Stores Google OAuth profiles
- One per user
- Email is unique
- Example: `{ id: 1, name: "John Doe", email: "john@email.com", picture: "url" }`

### bookings
- Stores user sprint reservations
- Links to users table
- Unique constraint: one booking per user per date
- Example: `{ user_id: 1, project_type: "website", project_name: "Club Portal", preferred_date: "2026-03-14" }`

### available_slots
- Stores available sprint dates/times
- Pre-populated with weekends for next 12 weeks
- Can be disabled when slots fill up
- Example: `{ date: "2026-03-14", time: "18:00", is_available: true }`

## API Endpoints

### Auth
- `GET /auth/google` - Start login
- `GET /auth/google/callback` - Google callback
- `GET /logout` - Logout user
- `GET /api/user` - Get logged-in user

### Bookings
- `GET /api/available-slots` - Get open slots
- `POST /api/bookings` - Create booking
- `GET /api/my-bookings` - Get user's bookings

## Deployment

### Netlify

1. Connect GitHub repo to Netlify
2. Set environment variables in Netlify UI:
   - `VITE_GOOGLE_CLIENT_ID`
   - `VITE_GOOGLE_CLIENT_SECRET`
   - `DATABASE_URL`
   - `SESSION_SECRET`
3. Build command: `npm install`
4. Publish directory: `.`
5. Deploy!
6. Add your Netlify domain to Google OAuth redirect URIs

### Vercel

```bash
vercel --prod
```

Add environment variables in Vercel project settings.

## Troubleshooting

### "Google login not working"
- ✅ Check `VITE_GOOGLE_CLIENT_ID` is set
- ✅ Verify redirect URI in Google Console matches your domain
- ✅ Clear browser cookies

### "Database connection error"
- ✅ Verify `DATABASE_URL` is correct
- ✅ Check Neon database is active
- ✅ Ensure IP whitelist allows your server

### "Can't see booking form after login"
- ✅ Check browser console for errors
- ✅ Verify user session is created (check cookies)
- ✅ Try clearing cache: Ctrl+Shift+Delete

### "Slots not showing in calendar"
- ✅ Run `node init-slots.js` to populate dates
- ✅ Check available_slots table has data

## Next Steps

### Immediate (Week 1)
- [ ] Set up Google OAuth credentials
- [ ] Create Neon database
- [ ] Test locally
- [ ] Deploy to Netlify/Vercel

### Short-term (Month 1)
- [ ] Add email confirmation notifications
- [ ] Create admin dashboard to manage bookings
- [ ] Add booking status tracking (pending → approved → done)

### Medium-term (Month 2-3)
- [ ] Stripe payment integration for paid tiers
- [ ] Slack notifications for new bookings
- [ ] Calendar export (iCal)
- [ ] Team assignment system

### Long-term (Month 4+)
- [ ] Mobile app
- [ ] GitHub integration
- [ ] Video call scheduling
- [ ] Project portfolio showcase

## Support & Contact

📧 Email: makeitexist@aim.edu  
💬 Slack: #make-it-exist  
🐛 Issues: GitHub Issues in repo  

---

Built with ❤️ at AIM Manila | 2026
