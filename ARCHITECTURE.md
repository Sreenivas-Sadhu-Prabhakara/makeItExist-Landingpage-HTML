# Make It Exist - Booking System Architecture

## User Flow

```
User visits /booking.html
    ↓
[Not logged in?]
    ├─→ Show "Sign in with Google" button
    │       ↓
    │   User clicks button
    │       ↓
    │   Redirected to Google OAuth
    │       ↓
    │   User approves access
    │       ↓
    └─→ Callback to /auth/google/callback
           ↓
    [Create or get user from DB]
           ↓
    Redirect to /booking.html?success=true
           ↓
Show Booking Form with:
  - Project Type selector (Website / App / AI)
  - Project Name input
  - Project Description textarea
  - Phone number (optional)
  - Date picker (calendar)
           ↓
User fills form and clicks "Confirm Booking"
           ↓
POST /api/bookings with data
           ↓
Backend validates and creates booking in DB
           ↓
[Success?]
    ├─→ Yes: Show confirmation & email sent
    └─→ No: Show error message
```

## Database Schema

```
┌─────────────────────────────────┐
│           USERS                 │
├─────────────────────────────────┤
│ id (PK)                         │
│ google_id (UNIQUE)              │
│ email (UNIQUE)                  │
│ name                            │
│ picture                         │
│ created_at                      │
└─────────────────────────────────┘
           │
           │ (1:many)
           ↓
┌─────────────────────────────────┐
│        BOOKINGS                 │
├─────────────────────────────────┤
│ id (PK)                         │
│ user_id (FK → users)            │
│ project_type                    │
│ project_name                    │
│ description                     │
│ preferred_date                  │
│ email                           │
│ phone                           │
│ status (pending/approved/done)  │
│ created_at                      │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│     AVAILABLE_SLOTS             │
├─────────────────────────────────┤
│ id (PK)                         │
│ date                            │
│ time                            │
│ is_available                    │
│ created_at                      │
└─────────────────────────────────┘
```

## API Endpoints

### Authentication

```
GET /auth/google
  → Starts Google OAuth flow

GET /auth/google/callback
  → Google redirects here with auth code
  → Creates/updates user in DB
  → Establishes session
  → Redirects to /booking.html

GET /api/user
  → Returns current logged-in user
  → Requires: authenticated session
  → Response: { id, google_id, email, name, picture }

GET /logout
  → Destroys session
  → Redirects to /
```

### Bookings

```
GET /api/available-slots
  → Returns all available weekend slots for next 60 days
  → Response: [{ date, times: [...] }, ...]

POST /api/bookings
  → Creates new booking
  → Requires: authenticated session
  → Body: {
      project_type: "website|webapp|ai",
      project_name: "string",
      description: "string",
      preferred_date: "YYYY-MM-DD",
      phone: "string (optional)"
    }
  → Response: { success: true, booking: {...} }

GET /api/my-bookings
  → Returns user's bookings
  → Requires: authenticated session
  → Response: [{ id, project_type, project_name, status, ... }, ...]
```

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Frontend | HTML/CSS/JS | Booking interface |
| Framework | Tailwind CSS | Styling |
| Calendar | Flatpickr | Date selection |
| Backend | Node.js + Express | API server |
| Auth | Passport + Google OAuth | User authentication |
| Database | PostgreSQL (Neon) | Data storage |
| Session | express-session | User sessions |

## Deployment Checklist

- [ ] Create Google OAuth credentials
- [ ] Create Neon PostgreSQL database
- [ ] Set all environment variables
- [ ] Run `npm install`
- [ ] Run `node init-slots.js` to add sprint slots
- [ ] Test locally: `npm run dev`
- [ ] Deploy to Netlify/Vercel
- [ ] Update Google OAuth redirect URIs for production domain
- [ ] Test booking flow on production
- [ ] Set up email notifications (optional future feature)

## Security Considerations

✅ **Implemented:**
- Google OAuth (no password storage)
- Session-based authentication
- CSRF protection via Passport
- Input validation
- SQL injection protection (parameterized queries)

⚠️ **Recommended Additions:**
- Rate limiting (prevent spam bookings)
- Email verification
- HTTPS enforcement
- API key rotation
- Database backups
- Audit logging

## Future Enhancements

### Phase 2
- Admin dashboard to manage bookings
- Email confirmation & reminders
- Calendar export (iCal)
- Team assignment system

### Phase 3
- Payment processing (Stripe)
- Project status tracking
- Client feedback system
- Analytics dashboard

### Phase 4
- Mobile app
- Slack integration
- GitHub integration
- Video call scheduled
