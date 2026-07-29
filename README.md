# Halina

Halina is a Filipino restaurant prototype for checking live crowd levels and estimated wait times before visiting.

## Tech stack

Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth, Prisma + PostgreSQL (Supabase). Queue/table data is still local mock data.

## Prerequisites

- Node.js 20+
- Access to the project's Supabase project (ask Gio for the needed passwords/URIs)

## Run locally

```bash
npm install
```

Create two env files in the project root (both are gitignored):

**`.env.local`** — used by the Next.js app for Supabase Auth:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

**`.env`** — used by Prisma to reach the Supabase Postgres database:
```
DATABASE_URL=   # Supabase "Transaction pooler" connection string (port 6543)
DIRECT_URL=     # Supabase "Session pooler" connection string (port 5432)
```
Get all four values from Supabase dashboard → Project Settings → Database / API.

Then generate the Prisma client (its output is gitignored, so this is required after every fresh clone and after any `prisma/schema.prisma` change):
```bash
npx prisma generate
```

Only if the database itself is missing tables (e.g. you're pointing at a brand-new Supabase project, not the shared one) — apply the schema:
```bash
npx prisma db push --url="$DIRECT_URL"
```
Note the explicit `--url` override: `db push`/`migrate dev` hang indefinitely against the pooled `DATABASE_URL` (port 6543) — Supabase's transaction-mode pooler isn't compatible with the protocol Prisma's schema engine needs. Always point schema-changing commands at `DIRECT_URL` instead.

Finally:
```bash
npm run dev
```

## Current status

Queue list, status badges, and Supabase Auth (login/signup with customer/manager/employee roles) are done. Queue/table/restaurant data is still hardcoded mock data — no data layer for it yet.

## Available routes

- `/` — customer restaurant feed
- `/login` — log in or register (customer, manager, or employee)
- `/restaurants/salu-salo` — sample restaurant detail
- `/manager` — manager dashboard (requires a manager account)
- `/manager/layout` — static layout-builder placeholder
- `/manager/analytics` — sample analytics
- `/employee` — employee table and queue dashboard (requires an employee or manager account)

## Next teammate tasks

Start with the items in [docs/FUTURE_WORK.md](docs/FUTURE_WORK.md), then replace mock data with a database-backed data layer when the team is ready.
