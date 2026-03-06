# Make It Exist - Booking System Setup

A modern booking system for AIM Student Tech projects with Google OAuth authentication and Neon DB backend.

## Features

✨ **Google OAuth Login** - Seamless authentication with Gmail  
📅 **Calendar Booking** - Select weekends for your sprint  
💾 **Neon Database** - Secure credential storage  
🎨 **Dark Mode** - Beautiful UI with theme support  
📱 **Responsive Design** - Works on all devices  
🚀 **Fast Deployment** - Ready for Netlify/Vercel  

## Prerequisites

- Node.js 16+ 
- npm or yarn
- PostgreSQL (via Neon)
- Google OAuth credentials

## Installation

### 1. Clone & Install Dependencies

```bash
cd makeItExist-Landingpage-HTML
npm install
```

### 2. Set Up Neon Database

1. Go to [neon.tech](https://neon.tech) and create a free account
2. Create a new project and database
3. Copy your `DATABASE_URL` (postgres://...)

### 3. Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project
3. Enable Google+ API
4. Create OAuth 2.0 credentials (Web application)
5. Add authorized redirect URI: `http://localhost:3000/auth/google/callback`
6. Copy your `Client ID` and `Client Secret`

### 4. Environment Setup

Create `.env` file in the project root:

```env
# Google OAuth
VITE_GOOGLE_CLIENT_ID=your_client_id_here
VITE_GOOGLE_CLIENT_SECRET=your_client_secret_here

# Database
DATABASE_URL=postgresql://user:password@host/database

# Session
SESSION_SECRET=your_random_secret_key_here

# Server
PORT=3000
NODE_ENV=development
```

For local development, you can get a random secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5. Start the Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Server runs on `http://localhost:3000`

## Usage

### For Users

1. Visit `/booking.html`
2. Click "Sign in with Google"
3. Select project tier, name, and preferred weekend
4. Confirm booking
5. Receive confirmation email

### Database Tables

The system automatically creates 3 tables:

**users** - Google OAuth profiles
```sql
- id (primary key)
- google_id (unique)
- email (unique)
- name
- picture
- created_at
```

**bookings** - User project bookings
```sql
- id (primary key)
- user_id (foreign key)
- project_type (website/webapp/ai)
- project_name
- description
- preferred_date
- email
- phone
- status (pending/approved/completed)
- created_at
- UNIQUE constraint on (user_id, preferred_date)
```

**available_slots** - Weekend sprint slots
```sql
- id (primary key)
- date
- time
- is_available (boolean)
- created_at
```

## API Endpoints

### Authentication
- `GET /auth/google` - Start OAuth flow
- `GET /auth/google/callback` - OAuth callback
- `GET /api/user` - Get current user (requires auth)
- `GET /logout` - Logout user

### Bookings
- `GET /api/available-slots` - Get available dates/times
- `POST /api/bookings` - Create booking (requires auth)
- `GET /api/my-bookings` - Get user's bookings (requires auth)

## Deployment

### Netlify

1. Connect your GitHub repo to Netlify
2. Set build command: `npm install && npm start`
3. Add environment variables in Netlify settings
4. Deploy!

### Vercel

```bash
vercel --prod
```

## Security Notes

🔒 **HTTPS only** in production  
🔑 **Session secrets** - Use strong random keys  
🗝️ **API keys** - Never commit `.env` to Git  
✅ **CORS** - Configure for your domain  
🛡️ **CSRF protection** - Passport handles this  

## Troubleshooting

### "Deploy directory does not exist"
- Ensure you have `.html` files in the repo root
- Set `publish = "."` in netlify.toml

### "Cannot GET /auth/google"
- Check `VITE_GOOGLE_CLIENT_ID` is set correctly
- Verify redirect URI in Google Console matches your deployment URL

### Database connection errors
- Verify `DATABASE_URL` is correct
- Check Neon database is active
- Ensure IP whitelist allows your server

### CORS issues
- Update `cors` origin in `server.js`
- Add your domain to Google OAuth credentials

## File Structure

```
makeItExist-Landingpage-HTML/
├── index.html              # Home page
├── solutions.html          # Services/tiers
├── team.html              # Team page
├── booking.html           # Booking page (NEW)
├── server.js              # Express backend (NEW)
├── package.json           # Dependencies (NEW)
├── .env.example           # Env template (NEW)
├── assets/                # Images
└── README.md
```

## Next Steps

1. **Admin Panel** - Create dashboard to manage bookings
2. **Email Notifications** - Send confirmations & reminders
3. **Stripe Integration** - Payment for paid tiers
4. **Slack Notifications** - Alert team of new bookings
5. **Project Tracking** - Public status page for projects

## Support

Need help? Reach out to the Make It Exist team at makeitexist@aim.edu

---

Built with ❤️ at AIM Manila
