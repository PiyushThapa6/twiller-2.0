# Twiller 2.0

Twiller 2.0 is a full-stack social app with Firebase-based auth on the frontend, an Express/MongoDB backend, subscription payments through Razorpay, email and SMS verification flows, audio tweet support, and profile/login-history features.

## Stack

- Frontend: React 19, Vite, React Router, Tailwind, Firebase client SDK
- Backend: Express 5, Mongoose, Firebase Admin, Nodemailer, Twilio, Razorpay
- Database: MongoDB
- Payments: Razorpay test/live keys
- Storage: Firebase Storage for audio uploads

## Project Structure

```text
twiller-2.0/
├── backend/   # Express API, MongoDB models, payment and OTP flows
└── twiller/   # Vite React frontend
```

## Features

- Email/password signup and login with Firebase Auth
- Google sign-in
- Login challenge flow with OTP for selected browser/device cases
- Forgot-password request flow
- User profile editing
- Feed with tweets, likes, and retweets
- Image and audio tweet support
- Email OTP verification for audio tweets
- Language preference update with OTP confirmation
- Subscription plans: Free, Bronze, Silver, Gold
- Razorpay order creation and payment verification
- Login history tracking
- Browser notification toggle for keyword alerts

## Prerequisites

- Node.js 18+
- npm
- MongoDB connection string
- Firebase project for Auth and Storage
- Razorpay account and API keys
- SMTP credentials for email flows
- Twilio credentials if you want SMS functionality

## Environment Variables

### Frontend

Create `twiller/.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_value
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_value
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_value
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_value
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_value
NEXT_PUBLIC_FIREBASE_APP_ID=your_value
NEXT_PUBLIC_BACKEND_URL=http://localhost:5000
```

The frontend runs on Vite. In local dev, that is typically `http://localhost:5173` or `http://localhost:5174`, but it still calls the backend API on `http://localhost:5000` unless you change `NEXT_PUBLIC_BACKEND_URL`.

### Backend

Create `backend/.env`:

```env
PORT=5000
MONOGDB_URL=your_mongodb_connection_string

SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
SMTP_FROM_EMAIL=your_from_email

TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number

RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

FIREBASE_ADMIN_PROJECT_ID=your_project_id
FIREBASE_ADMIN_CLIENT_EMAIL=your_client_email
FIREBASE_ADMIN_PRIVATE_KEY=your_private_key
```

Note: the backend currently reads `MONOGDB_URL` exactly as written in the code. If you rename it to the more common `MONGODB_URL`, you must update the code too.

## Installation

### 1. Install backend dependencies

```bash
cd /Users/piyush/Documents/Playground/twiller-2.0/backend
npm install
```

### 2. Install frontend dependencies

```bash
cd /Users/piyush/Documents/Playground/twiller-2.0/twiller
npm install
```

## Running Locally

### Start the backend

```bash
cd /Users/piyush/Documents/Playground/twiller-2.0/backend
npm start
```

Expected default API URL:

```text
http://localhost:5000
```

### Start the frontend

```bash
cd /Users/piyush/Documents/Playground/twiller-2.0/twiller
npm run dev
```

Open the frontend URL printed by Vite in the terminal.

## Available Scripts

### Frontend

```bash
npm run dev
npm run build
npm run preview
npm run lint
```

### Backend

```bash
npm start
```

## Main API Routes

### Auth and user

- `POST /register`
- `GET /loggedinuser`
- `PATCH /userupdate/:email`
- `POST /forgot-password/request`

### OTP and access flows

- `POST /audio-otp/request`
- `POST /audio-otp/verify`
- `POST /login-access/request`
- `POST /login-access/verify`
- `POST /login-history/record`
- `POST /language-otp/request`
- `POST /language-otp/verify`

### Payments

- `POST /payment/order`
- `POST /payment/verify`

### Tweets

- `POST /post`
- `GET /post`
- `POST /like/:tweetid`
- `POST /retweet/:tweetid`

## Payment Notes

- The frontend creates a Razorpay order first, then opens Razorpay Checkout.
- The backend verifies the returned signature before activating the subscription.
- Subscription validity is currently set for one month from successful payment verification.
- The payment receipt format has already been shortened to satisfy Razorpay's receipt-length limit.

## Audio Tweet Notes

- Audio tweets support upload and in-browser recording.
- Audio file size is limited to 100 MB.
- Audio duration is limited to 5 minutes.
- Audio posting is gated by an IST time window in the backend/frontend logic.
- Email OTP verification is required before posting an audio tweet.

## Troubleshooting

### Payment order fails

Check these first:

- backend is running on `http://localhost:5000`
- `NEXT_PUBLIC_BACKEND_URL` points to the backend, not the Vite frontend port
- Razorpay keys are present in `backend/.env`
- MongoDB connection is working

### Backend does not start

Common causes:

- invalid or unreachable `MONOGDB_URL`
- missing SMTP, Firebase Admin, or Razorpay env values

### Frontend loads but API calls fail

- confirm the backend is listening on port `5000`
- restart the frontend after changing `.env.local`

## Current Gaps

- No automated tests are set up yet
- Backend only exposes a `start` script
- Some time-window values are still hardcoded in backend/frontend constants

## License

No license file is currently included in the repository.
