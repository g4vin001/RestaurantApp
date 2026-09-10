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

Team uses verified personal-account email whitelisting, restricted staff roles,
and a shared restaurant PIN for deliberate clock-in through `/work`. `/ops`
requires an active work session and is limited to the staff role's permissions.
`/admin/data-lab` stages validated CSV/XLSX
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
operation without requiring database credentials. Authenticated tenant and
database command behavior is covered by the isolated Preview PostgreSQL
integration suite. Full authenticated browser flows still require dedicated
test accounts.

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
- `/manager/team` — staff records, email work access, restricted roles, and restaurant PIN
- `/manager/settings` — restaurant identity, walk-in availability, hours, and cleaning target
- `/work` — verified personal-account staff clock-in, resume work, and clock-out
- `/ops` — restricted staff Live Floor, Queue, and Reservations workspace
- `/admin/data-lab` — allowlisted, secondary-password TEST data import and statistics lab

There is intentionally no `/employee` route. Staff use normal Supabase-authenticated
Halina accounts. Managers whitelist the exact verified email and configure the
restaurant's four-digit PIN; staff then clock in through `/work`.

## Manager and staff quick start

1. Sign in with the restaurant owner's or manager's account and open `/manager`.
   A first-time owner can create their restaurant at `/onboarding/restaurant`.
2. In **Restaurant settings**, check the timezone, weekly service periods,
   holiday exceptions and walk-in switch. Save before taking bookings. Existing
   bookings remain actionable if you later change the hours; review affected
   guests separately.
3. In **Floor editor**, create or review tables, capacities and zones, then
   publish the layout. Draft edits are separate from the floor used for service.
4. In **Team**, add each employee's exact personal Halina email, enable work
   access, and assign the appropriate restricted role. Configure the restaurant
   PIN and share it with staff internally. The PIN alone does not grant access.
5. Each employee signs into their own verified Halina account, opens **Work**
   (`/work`), chooses **Clock in** for the restaurant and enters its PIN. **Enter work mode**
   opens `/ops`. Sessions expire after at most 16 hours; use **Shift access**
   to resume or clock out. This is workspace access, not payroll/timekeeping.

During service, add walk-ins to Queue, call the party, then open **Seat** and
choose a fitting table or same-zone pair. Check that a proposed pair can actually
be joined before confirming. Calling a party records its status; it does not
send an SMS. Customer reservation requests require restaurant approval before
seating. Authorized staff can mark arrival, seat confirmed bookings, and move
seated reservations to another available table or pair.

After guests leave, move the table to **Cleaning**, then **Available** when ready.
Linked tables move through the workflow together. A recent mistake can be
corrected within 15 minutes with a reason, provided the tables have not changed
again. Watch the connection indicator on each device and refresh/reconnect when
the latest snapshot is unconfirmed. Check the existing party/table state before
repeating an action whose result was interrupted.

Managers use the full workspace for schedules, floor publishing, permissions,
reservation approval and deliberate booking-conflict overrides. Staff see only
the controls allowed by their role. Customers discover restaurants, see service
hours and availability, join an open waitlist, and submit booking requests.

Before the first real shift after an update, use a dedicated TEST restaurant
with one manager and one staff account on separate devices to confirm clock-in,
seating, clearing, corrections and cross-device updates. Demo mode is useful for
learning the manager interface, but cannot verify authenticated staff access.

## Restaurant schedules

Manager > Restaurant settings supports weekday hours, closed days, up to four
service periods per day, overnight service, and dated holidays or exceptions.
Times use the restaurant's timezone (Asia/Manila by default). A closing time at
or before its opening time belongs to the next day; equal times mean 24-hour
service. Overnight service belongs to the day it starts. A dated exception
replaces the entire calendar date from midnight, including any service carried
over from the previous night. An exception with no periods means closed all day.

Schedules are stored in the existing `Restaurant.operatingSettings.schedule`
JSON field through the tenant-scoped, transactional settings command, with
revision checks and idempotency. No schema migration is required. Restaurants
without a saved schedule retain their existing daily `opensAtHour` and
`closesAtHour` values as the weekly default. Older settings clients cannot erase
an existing schedule by omitting it. Demo mode stores the same structure only
in its existing browser repository.

The public directory, detail page, and manager status use the schedule to show
when the restaurant is closed. The manual walk-in switch can still pause
walk-ins during opening hours. Customer waitlist submissions reject closed
hours. New or rescheduled reservations must start during service; customer
bookings recheck the current schedule inside the existing capacity transaction.
Existing reservations remain actionable after hours change, so managers should
review affected bookings. Customer requests are explicitly shown as pending
approval, never confirmed before the restaurant approves them.

Occupancy counts service minutes only, including split shifts, overnight
carryover, and dated exceptions; it excludes closed periods from both the
numerator and denominator. Historical occupancy uses the **current saved
schedule**, not a versioned history of weekly schedule changes. Retain past
dated exceptions when they are still relevant to reporting. Dining duration and
other event-derived metrics continue to use actual recorded events.

Schedule validation, timezone boundaries, public projection privacy, and demo
reservation rules run in `npm test`. Schedule persistence, transaction rollback,
idempotent retries, stale edits, staff/tenant denial, and customer booking checks
are also covered by the Prisma integration suites. Those suites require an
isolated database configured with `HALINA_TEST_DATABASE_URL`; they are skipped
when it is absent. Authenticated multi-device/browser verification remains a
separate release check.

## Staff seating and live shift reliability

Authorized staff can seat waitlist parties and reservations at one table or a
same-zone pair, and move seated reservations to another fitting table or pair.
The picker uses the manager's recommendation rules, shows labels, zone, total
capacity and spare seats, and requires a deliberate confirmation. It loads
recommendations when opened and initially shows the best 12 options; the rest
remain available through **Show all suitable options**. This avoids rendering
every possible table pair for every guest on a busy shift. Staff must confirm
that tables can physically be joined because the floor model has no adjacency
data. Upcoming booking conflicts stay excluded; managers retain deliberate
clash overrides. Every save still checks permissions, availability, capacity,
booking conflicts and revisions in the shared transaction.

The staff workspace shares one realtime subscription between its desktop and
mobile indicators. **Live across devices** requires a subscribed channel and
a newly received server snapshot. A manual refresh alone cannot turn a failed
subscription green. Reconnects and returning to a backgrounded tab refresh
state, concurrent notifications are coalesced, and a refresh that takes more
than 20 seconds is shown as unconfirmed with a retry action. Seating and
correction forms show pending feedback and disable submission while offline.
An ended work session explains how to clock in again.

Manager and staff correction controls use the same eligibility rule: the
latest matching transition within 15 minutes, excluding corrections and table
moves. Controls expire while the page is open. The server requires a 4–500
character reason and verifies the latest command on every linked table before
changing the group atomically. The Prisma regression suite covers staff pair
seating, manager visibility, public availability, retries, conflicts and
correction; it requires `HALINA_TEST_DATABASE_URL`. The separate authenticated
browser CI job verifies manager and staff interactions against local Supabase.

For analytics, a combined party's size is distributed across its linked table
capacities using the same allocation rule as demo mode. This prevents counting
the whole party on each table. Per-table figures describe that allocation, not
measured individual seat positions. Table turns still count each occupied table.
Correcting a mistaken reservation seating restores its prior confirmed/arrived
state without inventing an arrival.

## Automated verification

`.github/workflows/verify.yml` runs on pull requests to `main` and pushes to
`main`. It performs a clean install, applies every committed migration to a
fresh PostgreSQL 17 service, runs lint, typecheck, unit and database integration
tests, and builds the app. A separate job installs Chromium and runs the manager
demo browser workflows, including mobile, tablet schedules and cross-tab checks.
A third job starts an isolated local Supabase stack and uses separate manager,
staff and other-restaurant browser sessions to check email/PIN clock-in, paired
seating, corrections, clearing, reconnect, Data API denial and clock-out. These
fixtures use generated accounts on loopback services only. Failed browser
runs retain diagnostic artifacts for seven days.

The database job uses only disposable CI credentials. `test/postgres/bootstrap.sql`
creates the Supabase schema dependencies required by the real migrations; it
does not emulate Supabase's Auth, Data API or Realtime services. The authenticated
browser job uses actual local Supabase services for those boundaries. Neither
job applies migrations to Debug or production. Deployment-specific configuration
still needs a smoke check on the intended environment.

The September 2026 MAIN database already has the staff clock-in schema and
email lookup index, recorded in Supabase's migration history as
`staff_whitelist_clock_in` and `staff_email_lookup_index`. Their corresponding
Prisma migration entries are not yet recorded there. Before a future schema
release, compare the installed schema with the committed SQL and reconcile
those entries through `prisma migrate resolve --applied` using the direct
connection. Do not reset the database or edit the migration ledger by hand.
The schedule and shift-reliability changes in this release add no migration.

Workflow setup follows the official [GitHub PostgreSQL service guide](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers)
and [Playwright CI guide](https://playwright.dev/docs/ci).

## Known limitations

- Vercel builds do not run database migrations. Every release must run `migrate status`, review pending SQL, and run `migrate deploy` through `DIRECT_URL` on port 5432 before deploying code that depends on it.
- Automatic Vercel deployment remains disabled for `agent/shared-operations-staff-data-lab` in `vercel.json`; Preview deployments from that branch are deliberate and use the isolated Debug Supabase project.
- Patched transitive versions for Prisma (`deepmerge-ts`), Next/PostCSS, and ExcelJS (`uuid`) are enforced with npm overrides. Remove an override only after its direct dependency ships an equivalent patched range and the full validation suite still passes.
- The floor editor is intentionally limited to tablet-landscape and desktop widths.
- POS, payments, ordering, payroll, and invented revenue analytics are outside the current scope.
- CI covers manager demo workflows, PostgreSQL commands, and authenticated staff clock-in, seating, corrections, Data API denial and Supabase Realtime. Import workflows and deployment-specific configuration still need separate smoke checks with dedicated TEST data.

Follow [AGENTS.md](AGENTS.md) for the production persistence and security phase.
