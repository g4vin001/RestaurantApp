# Halina

Halina is a Filipino restaurant operations prototype with manager, employee, and customer experiences.

## Tech stack

Next.js App Router, strict TypeScript, Tailwind CSS, Supabase Auth, Prisma + PostgreSQL (Supabase), and a browser-persisted demo operations repository.

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

### Explicit demo mode

Reviewers can run the manager prototype without an authentication account by adding this to `.env.local`:

```bash
NEXT_PUBLIC_HALINA_DEMO_MODE=true
```

Demo mode is visibly labeled in the interface. Table transitions, sessions, and events persist in localStorage, synchronize across browser tabs, and can be reset from the manager sidebar. When the switch is absent or false, the existing Supabase authentication and role guards remain enforced.

## Current status

The first manager vertical slice is implemented: a responsive manager shell, decision-focused Overview, interactive Live floor, valid table status transitions, timestamped events, session updates, browser persistence, tab synchronization, and analytics derived from the shared state. The interface labels this as prototype/demo data until the Prisma repository is implemented.

Quality commands:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Available routes

- `/` — customer restaurant feed
- `/login` — log in or register (customer, manager, or employee)
- `/restaurants/salu-salo` — sample restaurant detail
- `/manager` — live manager overview (manager account, or explicit demo mode)
- `/manager/floor` — interactive live floor and table transitions
- `/manager/layout` — legacy static layout-builder route; the full editor is the next vertical slice
- `/manager/analytics` — metrics calculated from shared demo sessions and queue state
- `/employee` — employee table and queue dashboard (requires an employee or manager account)

## Next teammate tasks

Follow [AGENTS.md](AGENTS.md). The next vertical slice is the Canva-like floor-plan editor with draft/publish versions connected to the Live floor.
