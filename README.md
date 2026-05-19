# God's Grace Fintech — Setup Guide

## Project Structure
```
gg-app/
├── app/
│   ├── layout.tsx              ← Root layout (already set up)
│   ├── page.tsx                ← Redirects to /login
│   ├── login/
│   │   └── page.tsx            ← Login page (email + Google)
│   ├── register/
│   │   └── page.tsx            ← Registration (2-step)
│   ├── dashboard/
│   │   └── page.tsx            ← User savings dashboard
│   ├── admin/
│   │   └── page.tsx            ← Admin control panel
│   └── auth/
│       └── callback/
│           └── route.ts        ← Google OAuth callback
├── components/
│   └── GGLogo.tsx              ← Reusable logo component
├── lib/
│   └── supabase/
│       ├── client.ts           ← Browser Supabase client
│       └── server.ts           ← Server Supabase client
├── public/
│   └── logo.svg                ← App logo (blue theme)
├── middleware.ts               ← Route protection
└── .env.example                ← Copy to .env.local
```

---

## Step 1 — Copy files into your project

Place every file from this ZIP into your `gg-app` folder
exactly matching the structure above.

---

## Step 2 — Install dependencies

Open PowerShell in your `gg-app` folder and run:

```powershell
npm install @supabase/supabase-js @supabase/auth-helpers-nextjs
```

---

## Step 3 — Create your .env.local

```powershell
copy .env.example .env.local
```

Then open `.env.local` in Notepad and fill in your keys.

---

## Step 4 — Set up Supabase

1. Go to https://supabase.com → create free project
2. Go to Settings → API → copy URL and anon key
3. Paste into `.env.local`
4. Go to SQL Editor → paste and run `001_gods_grace_schema.sql`
5. Make yourself admin:
```sql
UPDATE profiles SET is_admin = TRUE WHERE email = 'your@email.com';
```

---

## Step 5 — Enable Google Login (optional)

1. Go to https://console.cloud.google.com
2. Create project → Enable Google OAuth API
3. Create OAuth 2.0 credentials
4. Set redirect URI to:
   `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
5. Copy Client ID + Secret into:
   Supabase Dashboard → Authentication → Providers → Google

---

## Step 6 — Run the app

```powershell
npm run dev
```

Open browser at: http://localhost:3000

---

## URL Map

| URL             | Who sees it        |
|-----------------|--------------------|
| /login          | Everyone           |
| /register       | New users          |
| /dashboard      | Logged-in users    |
| /admin          | Admin only         |

---

## Test Accounts (mock data — remove before going live)

- **Admin:** admin@godsgrace.ng / admin123
- **User:** adaeze@example.com / user123
- **User:** emeka@example.com / user123

---

## Going Live Checklist

- [ ] Run SQL migration on production Supabase
- [ ] Switch Paystack TEST keys → LIVE keys
- [ ] Register Paystack webhook URL
- [ ] Remove test accounts from login page
- [ ] Deploy to Vercel: `npx vercel --prod`
- [ ] Set all env vars in Vercel dashboard
- [ ] Set yourself as admin in production DB
