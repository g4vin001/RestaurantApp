# Halina

Halina is a manager-first Filipino restaurant operations prototype with a lightweight public customer experience.

## Tech stack

Next.js App Router, strict TypeScript, Tailwind CSS, Supabase Auth, Prisma + PostgreSQL (Supabase), and a browser-persisted demo operations repository.

## Prerequisites

- Node.js 22+
- Access to the project's Supabase project (ask Gio for the needed passwords/URIs)

## Run locally

```bash
npm install
```

Copy `.env.example` to `.env.local` for local development. The file is
gitignored. Never commit or paste its values into issues or pull requests.

`DATABASE_URL` is the pooled runtime connection on port `6543`. `DIRECT_URL`
is the direct/session connection on port `5432` and is used only by Prisma CLI
migration commands. Supabase Auth values come from Project Settings → API.

`npm install` automatically generates the Prisma client through the `postinstall` script. Its output remains gitignored. You can also regenerate it explicitly after a schema change:

```bash
npx prisma generate
```

Before applying committed migrations, verify that `DIRECT_URL` points to the
intended non-production database without printing its credential, then run:

```bash
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status
```

Never use `prisma db push`, `prisma migrate reset`, table dropping, or database
recreation on a shared Halina database. Preview migrations must use an isolated
Preview Supabase project; production is a separate approval gate.

Finally:

```bash
npm run dev
```

### Explicit demo mode

Reviewers can run the manager prototype without an authentication account by adding this to `.env.local`:

```bash
NEXT_PUBLIC_HALINA_DEMO_MODE=true
```

Demo mode is visibly labeled in the interface. Table transitions, sessions, and events persist in localStorage, synchronize across browser tabs, and can be reset from the manager sidebar. When the switch is absent or false, Supabase authentication and restaurant-membership authorization are enforced.

To enter the manager demo, start the app and open [`/manager`](http://localhost:3000/manager). No manager account is required while explicit demo mode is enabled. The public customer experience remains available at [`/`](http://localhost:3000/).

## Current status

The high-fidelity manager app includes a responsive shell, versioned floor-plan editor, published Live floor, queue and reservation workflows, staff records, restaurant settings, and event-derived analytics.

The application now has one explicit operations-repository boundary. Demo mode uses deterministic browser persistence, while authenticated non-demo manager routes load a canonical, membership-scoped snapshot from PostgreSQL through Prisma. The database snapshot covers restaurant settings, floors and published versions, tables, recent sessions and events, queue entries, reservations, and staff records.

Authenticated database mode now routes Manager writes through tenant-scoped,
revisioned, idempotent server commands. Table/session changes, combined seating,
queue, reservations, Team records, settings, and floor drafts/publishing persist
transactionally. Conflict and database failures never silently fall back to demo
data. Private Realtime broadcasts invalidate manager/staff snapshots; public
clients receive only safe projection invalidations.

Team includes restricted roles, 24-hour email-bound invitations, QR/link/manual
code sharing, revocation, and regeneration. `/ops` is limited to the staff role's
Live Floor and Queue permissions. `/admin/data-lab` stages validated CSV/XLSX
history and applies it only to TEST restaurants, which are excluded from every
public discovery, booking, and waitlist route.

The reviewed foundation migration is stored in `prisma/migrations/20260802170000_shared_data_foundation`. It preserves the legacy profile fields, creates owner memberships for existing manager profiles with a restaurant name, and does not grant manager access to legacy employee profiles. It is intentionally not applied automatically: review it and validate it against a disposable or development database through the direct/session connection before using it on shared data.

Quality commands:

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

`npm run test:e2e` starts the app in explicit demo mode on port 3100 and checks
the manager shell, queue persistence, cross-tab synchronization, and mobile
operation without requiring database credentials. Authenticated tenant,
migration, and Data API security browser flows still require the isolated
Preview Supabase project and dedicated test accounts.

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
- `/manager/team` — staff records, restricted roles, and invitation status
- `/manager/settings` — restaurant identity, walk-in availability, hours, and cleaning target
- `/ops` — restricted invited-staff Live Floor and Queue workspace
- `/admin/data-lab` — allowlisted, secondary-password TEST data import and statistics lab

There is intentionally no `/employee` route. Staff use normal Supabase-authenticated Halina accounts and redeem an email-bound invite for restricted `/ops` access.

## Known limitations

- The new shared-operations and RLS migrations are committed but must not be applied to production until an isolated Preview Supabase project passes migration, Data API denial, runtime-log, and browser verification.
- Preview deployment is blocked while no isolated Supabase project is available; production is intentionally not used as a substitute.
- Automatic Vercel deployment is disabled for `agent/shared-operations-staff-data-lab` in `vercel.json`. Remove that branch gate only after its isolated Preview environment variables are configured, then deploy and inspect runtime logs explicitly.
- `npm audit` currently reports seven advisories (three moderate and four high) in the Prisma, Next/PostCSS, and ExcelJS dependency paths. npm's remaining automated proposals are breaking version changes, so `--force` is intentionally not used; recheck and upgrade through supported framework releases.
- The floor editor is intentionally limited to tablet-landscape and desktop widths.
- No employee application, POS, payments, ordering, payroll, or invented revenue analytics are part of this milestone.
- Demo browser end-to-end coverage runs locally. Authenticated cross-tenant, invitation, import, and Data API denial browser flows require the isolated Preview database and test accounts.

Follow [AGENTS.md](AGENTS.md) for the production persistence and security phase.
