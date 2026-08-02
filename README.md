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

To enter the manager demo, start the app and open [`/manager`](http://localhost:3000/manager). No manager account is required while explicit demo mode is enabled. The public customer experience remains available at [`/`](http://localhost:3000/).

## Current status

The high-fidelity manager prototype includes a responsive manager shell, a versioned floor-plan editor, a published Live floor, queue and reservation workflows, staff records, restaurant settings, and event-derived analytics. Manager actions persist in localStorage, synchronize across tabs, and safely update the public customer view.

Operational records are still browser-backed prototype data. Supabase provides authentication. The Prisma schema now includes the tenant-aware restaurant, membership, floor, table, session, queue, reservation, event, and staff foundation, but the application has not switched its operations repository to PostgreSQL yet.

The reviewed foundation migration is stored in `prisma/migrations/20260802170000_shared_data_foundation`. It preserves the legacy profile fields, creates owner memberships for existing manager profiles with a restaurant name, and does not grant manager access to legacy employee profiles. It is intentionally not applied automatically: review it and validate it against a disposable or development database through the direct/session connection before using it on shared data.

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
- `/onboarding/restaurant` — authenticated first-restaurant creation; creates a new restaurant and OWNER membership
- `/restaurants/salu-salo` — sample restaurant detail
- `/manager` — live manager overview (manager account, or explicit demo mode)
- `/manager/floor` — interactive live floor and table transitions
- `/manager/layout` — Canva-like floor editor with draft saving and immutable publish versions
- `/manager/queue` — live queue, table recommendations, seating, and reservation day view
- `/manager/analytics` — period, zone, and table analytics derived from shared operational events
- `/manager/team` — staff records and future permission presets; login access remains disabled
- `/manager/settings` — restaurant identity, walk-in availability, hours, and cleaning target

There is intentionally no `/employee` route. Staff are managed as records under `/manager/team`; they do not receive a separate application or public signup path in this milestone.

## Known limitations

- The operational repository is local to the browser and is not yet shared across devices.
- The shared-data Prisma migration is prepared but has not been applied to Supabase.
- Membership authorization and the PostgreSQL operations repository are the next implementation slice.
- `npm audit --omit=dev` currently reports three high advisories inherited through Next 15's bundled PostCSS/Sharp dependency path. npm only proposes a breaking downgrade to Next 9, so that automated fix is intentionally not applied; recheck when a compatible Next 15 patch is available.
- The floor editor is intentionally limited to tablet-landscape and desktop widths.
- No employee application, POS, payments, ordering, payroll, or invented revenue analytics are part of this milestone.
- End-to-end browser automation should be introduced with the future test setup; domain workflows have unit coverage.

Follow [AGENTS.md](AGENTS.md) for the production persistence and security phase.
