# Homigo Backend

Express + TypeScript API layer for the Homigo Supabase database.

## Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Create `backend/.env` and fill in:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `FRONTEND_ORIGIN`
4. Install and run:

```powershell
npm install
npm run dev
```

The API runs on `http://localhost:4000` by default.

## Main Routes

- `GET /health`
- CRUD routes for `/api/users`, `/api/properties`, `/api/conversations`, `/api/messages`, `/api/inquiries`, `/api/notifications`, and every schema table.
- Domain shortcuts:
  - `GET /api/properties/search`
  - `POST /api/properties/:propertyId/view`
  - `GET /api/users/:userId/dashboard`
  - `GET /api/users/:userId/matches`
  - `GET /api/users/:userId/saved`
  - `POST /api/users/:userId/saved`
  - `DELETE /api/users/:userId/saved/:savedId`
  - `GET /api/conversations/:conversationId/messages`
  - `POST /api/conversations/:conversationId/messages`
