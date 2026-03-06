#!/bin/bash

# Make It Exist - Quick Start Setup

echo "🚀 Make It Exist Booking System - Quick Setup"
echo "=============================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo ""
    echo "📝 Please create a .env file with the following:"
    echo ""
    cat .env.example
    echo ""
    echo "1. Get your Google OAuth credentials from: https://console.cloud.google.com"
    echo "2. Create a Neon database at: https://neon.tech"
    echo "3. Generate a session secret: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    echo ""
    exit 1
fi

echo "✅ .env file found"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi

echo ""
echo "🗄️  Initializing database..."
node server.js &
SERVER_PID=$!
sleep 2
kill $SERVER_PID

echo "🌱 Adding sprint slots..."
node init-slots.js

echo ""
echo "✨ Setup complete!"
echo ""
echo "To start the server:"
echo "  npm run dev     (Development with auto-reload)"
echo "  npm start       (Production)"
echo ""
echo "Then visit: http://localhost:3000/booking.html"
echo ""
