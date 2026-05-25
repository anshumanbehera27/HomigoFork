# Homigo

Homigo is a roommate + accommodation matching platform for curated co-living.

- **Seekers** discover compatible roommates and homes
- **Owners** list properties, complete KYC, and manage inquiries + chats

Live app (Vercel): https://homigo-chi.vercel.app/#/landing

## Repository structure

This is a monorepo:

- `backend/` — Express + TypeScript API backed by Supabase (Postgres), with Socket.io realtime messaging
- `frontend/` — React (Vite) + TypeScript UI using **hash routing** (`#/landing`, `#/role`, etc.)

## Tech stack

Backend:

- Node.js (recommended: 18+)
- Express + TypeScript
- Supabase (Postgres) via `@supabase/supabase-js`
- Socket.io (realtime chat)
- Swagger UI at `/api-docs`
- Optional: Clerk auth + webhooks
- Optional: Cloudinary uploads

Frontend:

- React + Vite + TypeScript
- Tailwind CSS (Material-ish palette)
- Clerk (optional, but used in the deployed app)

## Quick start (local)

Prereqs:

- Node.js + npm
- A Supabase project (URL + **service role key**)

### 1) Database (Supabase)

Run the schema in Supabase SQL editor:

1. `backend/supabase/schema.sql`
2. (Optional) `backend/supabase/schema_extensions_api.sql` (views/RPC helpers)

### 2) Backend (Express)

Create `backend/.env` (start from `backend/.env.example`):

```bash
PORT=4000

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY

# One origin or a comma-separated allowlist
FRONTEND_ORIGIN=http://localhost:5173,http://127.0.0.1:5173

# Optional (enable Clerk auth enforcement)
CLERK_SECRET_KEY=
CLERK_PUBLISHABLE_KEY=
CLERK_WEBHOOK_SECRET=

# Optional (Cloudinary uploads)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Run:

```bash
cd backend
npm install
npm run dev
```

Endpoints:

- Health: `GET http://localhost:4000/health`
- API base: `http://localhost:4000/api`
- Swagger UI: `http://localhost:4000/api-docs`

### 3) Frontend (Vite)

Create `frontend/.env.local` (start from `frontend/.env.example`):

```bash
# Defaults to http://localhost:4000/api if unset
VITE_API_BASE_URL=http://localhost:4000/api

# Clerk publishable key (recommended for production; optional for local demo mode)
VITE_CLERK_PUBLISHABLE_KEY=

# Demo mode user id (used when Clerk is disabled)
VITE_DEMO_USER_ID=1
```

Run:

```bash
cd frontend
npm install
npm run dev
```

App runs on `http://localhost:5173/#/landing`.

## Product flows (what you see on the deployed app)

The frontend uses hash routes (see `frontend/src/App.tsx`).

- Landing: `#/landing`
- Role selection: `#/role`
- Sign-in gate (Clerk): most screens show “Sign in to continue” when unauthenticated
- Seeker onboarding: `#/onboarding1` → `#/onboarding4`
- Owner onboarding: `#/owner1` → `#/owner5`
- Inbox: `#/messages`

## Environment variables

### Backend (`backend/.env`)

Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only secret)

Recommended:

- `FRONTEND_ORIGIN` — one origin or comma-separated allowlist (local + Vercel domain)

Optional:

- `CLERK_SECRET_KEY` — when set, the API enforces Clerk auth (with a small public allowlist)
- `CLERK_PUBLISHABLE_KEY` — used by Clerk middleware when `CLERK_SECRET_KEY` is set
- `CLERK_WEBHOOK_SECRET` — used by `POST /api/webhooks/clerk`
- `CLOUDINARY_*` — enables `POST /api/upload`

### Frontend (`frontend/.env.local`)

Required:

- `VITE_API_BASE_URL` — your backend API, e.g. `https://api.yourdomain.com/api`

Recommended (production):

- `VITE_CLERK_PUBLISHABLE_KEY` — use a **production** Clerk instance key when deploying

Optional:

- `VITE_DEMO_USER_ID` — local/demo mode fallback user id when Clerk is disabled

## Deployment

The deployed site you shared is a typical split deployment:

- Frontend on Vercel
- Backend on a Node.js host (Render/Fly/Railway/etc.)
- Supabase as the database

### Deploy frontend to Vercel

1. Import the repo in Vercel.
2. Set **Root Directory** to `frontend`.
3. Build command: `npm run build`
4. Output directory: `dist`
5. Set Vercel Environment Variables:
   - `VITE_API_BASE_URL` = `https://<your-backend-host>/api`
   - `VITE_CLERK_PUBLISHABLE_KEY` = your Clerk publishable key

Notes:

- Hash routing (`#/...`) needs no special rewrite rules on Vercel.
- Use `https://` for `VITE_API_BASE_URL` in production to avoid mixed-content issues.

### Deploy backend (Node)

Deploy `backend/` as a normal Node service.

1. Set environment variables (same as `backend/.env.example`).
2. Ensure CORS allowlist includes your Vercel domain:
   - `FRONTEND_ORIGIN=https://homigo-chi.vercel.app,https://your-custom-domain.com`
3. Start command: `npm run start` (after `npm run build`).

If Clerk is enabled:

- Set `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY`
- Configure Clerk webhooks to hit `POST /api/webhooks/clerk` and set `CLERK_WEBHOOK_SECRET`

## API + realtime notes

- Swagger UI: `/api-docs`
- Socket.io runs on the same host as the backend (no separate port).
  - Client connects to `SOCKET_URL = VITE_API_BASE_URL` with `/api` removed.
  - Handshake auth: `auth: { user_id: <numeric user id> }`

## Security notes

- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the frontend (Vercel env vars for the React app are bundled into client JS).
- If you see “Clerk has been loaded with development keys” on the deployed site, switch to **production** Clerk keys for a real prod deployment.

## Troubleshooting

- Backend won’t start: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are required and validated at startup.
- CORS issues: set `FRONTEND_ORIGIN` to exactly match the origin(s) you open in the browser.
- 401 Unauthorized: happens when `CLERK_SECRET_KEY` is set but the frontend isn’t sending a Clerk JWT.

## Scripts

Backend:

```bash
cd backend
npm run dev
npm run build
npm run start
```

Frontend:

```bash
cd frontend
npm run dev
npm run build
npm run preview
```
