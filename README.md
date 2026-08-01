# Halina

Halina is a manager-first Filipino restaurant operations prototype with a lightweight public customer experience.

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

`npm install` automatically generates the Prisma client through the `postinstall` script. Its output remains gitignored. You can also regenerate it explicitly after a schema change:

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

The high-fidelity manager prototype includes a responsive manager shell, a versioned floor-plan editor, a published Live floor, queue and reservation workflows, staff records, restaurant settings, and event-derived analytics. Manager actions persist in localStorage, synchronize across tabs, and safely update the public customer view.

Operational records are still browser-backed prototype data. Supabase provides authentication and Prisma currently models profiles; database-backed restaurant operations and staff invitations are intentionally deferred.

Quality commands:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Available routes

- `/` — customer restaurant feed
- `/login` — log in or create a customer account; staff access is not publicly self-service
- `/restaurants/salu-salo` — sample restaurant detail
- `/manager` — live manager overview (manager account, or explicit demo mode)
- `/manager/floor` — interactive live floor and table transitions
- `/manager/layout` — Canva-like floor editor with draft saving and immutable publish versions
- `/manager/queue` — live queue, table recommendations, seating, and reservation day view
- `/manager/analytics` — period, zone, and table analytics derived from shared operational events
- `/manager/team` — staff records and future permission presets; login access remains disabled
- `/manager/settings` — restaurant identity, walk-in availability, hours, and cleaning target

## Known limitations

- The operational repository is local to the browser and is not yet shared across devices.
- The floor editor is intentionally limited to tablet-landscape and desktop widths.
- No employee application, POS, payments, ordering, payroll, or invented revenue analytics are part of this milestone.
- End-to-end browser automation should be introduced with the future test setup; domain workflows have unit coverage.

Follow [AGENTS.md](AGENTS.md) for the production persistence and security phase.
