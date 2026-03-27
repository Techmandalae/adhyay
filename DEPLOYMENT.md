# Deployment

This repo is easiest to deploy as:

- `frontend` on Vercel
- `backend` on Render
- PostgreSQL on Neon

That split matches the current code:

- `frontend` is a standalone Next.js app in `frontend/`
- `backend` is a standalone Express + Prisma app in `backend/`
- the backend writes uploads to disk, so it needs persistent storage in production

## 1. Database

Create a Postgres database and copy the production connection string into:

- `backend` -> `DATABASE_URL`

For Neon, use the direct or pooled connection string from the dashboard. This app uses Prisma migrations in production, so keep one production-safe `DATABASE_URL` configured on the backend.

## 2. Backend on Render

Use the included `render.yaml`.

What it does:

- deploys the backend from `backend/`
- runs `npm ci && npm run build`
- runs `npm run migrate:deploy` before start
- mounts a persistent disk at `/var/data`
- stores uploads under `/var/data/uploads`

Required backend environment variables are listed in `backend/.env.example`.

Minimum production values:

- `DATABASE_URL`
- `JWT_SECRET`
- `OPENAI_API_KEY`
- `CORS_ORIGIN`
- `FRONTEND_URL`

Recommended backend domain:

- `api.yourdomain.com`

## 3. Frontend on Vercel

Create a Vercel project with:

- Root Directory: `frontend`
- Framework Preset: `Next.js`

Set:

- `NEXT_PUBLIC_API_URL=https://api.yourdomain.com`

That variable is defined in `frontend/.env.example`.

Recommended frontend domain:

- `app.yourdomain.com`

## 4. DNS

Recommended DNS layout:

- `app.yourdomain.com` -> Vercel
- `api.yourdomain.com` -> Render

Keep frontend and backend on separate subdomains so:

- CORS stays explicit
- API and app can be moved independently later
- SSL is managed cleanly by each platform

## 5. First production deploy

Order:

1. Create the database
2. Deploy backend and set env vars
3. Confirm backend health endpoint works
4. Deploy frontend with `NEXT_PUBLIC_API_URL`
5. Add custom domains
6. Update backend `CORS_ORIGIN` and `FRONTEND_URL` to the real frontend domain
7. Redeploy backend

## 6. Post-deploy checks

Verify:

- `GET /health` returns success on the backend
- login works from the frontend domain
- exam generation works
- PDF generation works
- student uploads survive a backend restart

## 7. Notes

- The backend currently stores uploaded files locally, so the Render service should stay on a plan that supports persistent disks.
- `prisma.config.ts` has been adjusted so production deploys can run `prisma migrate deploy` without requiring `SHADOW_DATABASE_URL`.
