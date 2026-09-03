You are working on the Halina restaurant app repository:

g4vin001/RestaurantApp

GOAL
Make a sizeable, reviewable pass toward a complete restaurant demo.

Do NOT redesign Halina or replace the current architecture. The current manager-first, database-backed structure is the baseline to preserve.

The objective of this task is to complete three related areas:

1. Make Halina visibly and reliably “live”
2. Complete the customer → manager reservation lifecycle
3. Make the repository/demo easier for teammates to understand and reproduce

IMPORTANT: FIRST INSPECT CURRENT MAIN
Before changing anything:

- checkout/pull the latest main
- read AGENTS.md completely
- inspect README.md
- inspect the current Prisma schema and migrations
- inspect the current manager/customer/staff routes
- inspect existing tests
- inspect current realtime implementation
- inspect reservation domain/command types and customer reservation creation

Do not trust old README/AGENTS statements if the actual implementation proves they are stale.

Do not recreate functionality that already exists.

Do not merge into main.
Do not deploy production.
Do not apply migrations to production.
Do not modify or delete production data.
Work on a new branch.

Suggested branch:
agent/demo-hardening-reservation-flow


==================================================
PART A — LIVE TIME / REALTIME RELIABILITY
==================================================

Halina already has database-backed operations and Supabase realtime invalidation.

The problem is that some pages only update when database state changes, while other values depend simply on time passing.

Fix this properly.

A1. Create one reusable client-side live clock hook.

Example concept:

useLiveNow(intervalMs)

It should:
- return the current Date
- tick at the requested interval
- clean up its interval properly
- refresh immediately when the browser tab becomes visible again
- avoid unnecessary timers while the document is hidden if practical

Put it somewhere reusable, not duplicated across manager components.

A2. Use the shared clock in Manager Overview.

Anything such as:
- longest wait
- queue elapsed time
- cleaning elapsed time
- table elapsed status
- stale indicators
- time-based alerts

must update even when nobody changes database state.

Recommended:
30 second tick.

Do not require F5.

A3. Use the same shared clock for Live Floor and Queue.

If those screens currently have their own local timer hooks, consolidate them into the shared implementation without changing behavior.

Recommended:
30 second tick.

A4. Make Analytics update time-dependent active-session calculations.

Analytics can update less frequently.

Recommended:
60 second tick.

Do not hammer the database unnecessarily. If the calculation can use the already-loaded state plus a new local `now`, do that.

A5. Fix the PUBLIC HOMEPAGE live refresh.

The individual restaurant detail page already has a realtime/periodic refresh mechanism.

The homepage restaurant list must also stay reasonably fresh while left open.

Implement a lightweight solution such as:
- refresh every 10–15 seconds while the tab is visible
- refresh immediately when returning to a hidden tab
- optionally subscribe to safe public invalidation if the current realtime architecture supports doing this without leaking tenant/private data

Do NOT expose private restaurant events/data.

Do not create one Supabase subscription per restaurant if that scales badly; inspect the current invalidation design and choose the simplest safe approach.

A6. Staleness must age while the page is open.

Example:
last DB update = 2:00 PM
customer opened at 2:01 PM

At 2:10 PM the UI must be capable of showing that the data is stale even if no new DB event occurred.

A7. Standardize timezone behavior.

Halina is currently Philippines-first.

Inspect Restaurant.timezone support.

Prefer:
restaurant.timezone

Fallback:
Asia/Manila

Visible operational timestamps should not silently depend on the laptop/device timezone.

Centralize formatting helpers where practical.

Do not convert stored database timestamps away from UTC; this is a display concern.


==================================================
PART B — COMPLETE RESERVATION APPROVAL
==================================================

Current customer reservation behavior:

Customer booking
→ Reservation status PENDING_APPROVAL
→ reservation consumes capacity
→ manager can see it

But the lifecycle lacks a proper manager approval action.

Complete it.

B1. Add manager approval.

Required transition:

PENDING_APPROVAL
→ CONFIRMED

Add this to the production database operations command layer rather than creating a one-off route that bypasses the normal repository/domain architecture.

Preserve:
- restaurant tenant scoping
- membership authorization
- expected revision / optimistic concurrency
- idempotent command IDs
- transaction handling
- realtime invalidation

B2. Add manager rejection.

For this milestone, prefer using the existing CANCELLED status rather than inventing a new DECLINED enum unless the current domain already provides one.

UI wording can say:

Reject request

but internally:

PENDING_APPROVAL → CANCELLED

If there is already a cancellation reason structure, use it. Otherwise do not expand the schema just for this.

B3. Manager reservation UI.

Pending customer reservations should clearly look pending and expose obvious primary actions:

[ Approve ] [ Reject ]

Once approved:
- status becomes CONFIRMED
- normal ARRIVED → SEATED → COMPLETED flow remains available

Once rejected:
- status becomes CANCELLED
- it should no longer consume active reservation capacity if the current active-status rules exclude CANCELLED

B4. Customer “My reservations”.

The customer must see the result:

Pending approval
Confirmed
Cancelled
Arrived
Seated
Completed
No-show

Use friendly labels rather than raw enum formatting.

If the page does not currently refresh after manager changes, add a reasonable refresh/realtime mechanism consistent with the public/customer architecture.

B5. Ensure reservation capacity calculations stay correct.

PENDING_APPROVAL and CONFIRMED should both reserve capacity.

CANCELLED/NO_SHOW/COMPLETED should not block future bookings unless there is a deliberate existing rule.

Do not weaken the existing concurrent-overbooking protection.


==================================================
PART C — DEMO REPEATABILITY / REPO CLEANUP
==================================================

Do a contained cleanup that directly helps the restaurant demo.

C1. Add a synthetic Data Lab sample file.

Inspect the current CSV/XLSX Data Lab parser before creating it.

Prefer a simple committed CSV unless XLSX is materially required.

Suggested location:

examples/data-lab/halina_demo_history.csv

Use entirely fake/synthetic data.

Include enough history to make analytics interesting:
- several tables of different capacities
- queue waits
- seated parties
- dining sessions
- cleaning durations
- reservations
- a mix of party sizes
- multiple hours/days if supported by the importer

Do not include real names, emails, phone numbers or PII.

Add:

examples/data-lab/README.md

Explain exactly:
- what file to upload
- where `/admin/data-lab` is
- TEST restaurants only
- what the import is intended to demonstrate
- how to revert the import if the feature supports revert

C2. Update stale documentation.

AGENTS.md currently contains historical information about old branches/PR state.

Update ONLY clearly stale repository-state sections.

Do not remove useful engineering/product rules.

At minimum ensure docs correctly describe:
- main is now the working database-backed implementation
- production Manager writes exist
- staff access uses `/ops`
- Data Lab exists
- customer public floor exists
- realtime exists
- combined-table persistence exists
- reservation approval status after this task
- current known limitations

Also update these stale lightweight docs if their contents no longer match reality:

docs/APP_FLOW.md
docs/DATA_MODEL.md
docs/FUTURE_WORK.md

Keep them concise and useful to teammates.

C3. Repo-generated artifact cleanup.

Check whether `tsconfig.tsbuildinfo` is currently tracked.

If it is generated and not intentionally required:
- remove it from the repo
- add it to .gitignore

Do not randomly delete other files.

C4. Legacy skeleton check.

There are old-looking files such as:
- components/TableCard.tsx
- components/QueueList.tsx
- components/LayoutPreview.tsx
- components/AnalyticsSummary.tsx
- possibly parts of lib/types.ts

Search the entire repository.

ONLY remove a legacy file if:
- nothing imports it
- it is clearly superseded by the current manager/customer architecture
- removing it does not complicate the diff

Do not perform a large cleanup/refactor just because code looks old.


==================================================
PART D — TESTS
==================================================

Add tests for the changes.

D1. Reservation domain/command tests.

Required coverage:
- pending reservation can be approved
- approved reservation becomes CONFIRMED
- pending reservation can be rejected/cancelled
- stale revision fails with CONFLICT
- cross-restaurant mutation is impossible
- repeated command ID is safely idempotent
- cancelled reservation no longer counts against booking capacity
- pending reservation still counts against booking capacity

D2. Live-time tests where practical.

Test the shared time helper/hook logic where sensible.

At minimum test any pure stale-time calculation introduced.

D3. Public projection privacy regression.

Do not expose:
- party names
- contacts
- notes
- employee/staff records
- reservation details
- internal audit events

No realtime change may weaken this.

D4. E2E demo coverage.

Extend Playwright where reasonably possible.

At minimum ensure existing demo E2E still passes.

If authenticated Supabase E2E requires credentials unavailable locally, DO NOT fake success.

Document exactly what authenticated manual/browser test remains to be run against Halina_Debug.


==================================================
PART E — QUALITY GATE
==================================================

Before finishing, run:

npm ci
npx prisma generate
npx prisma validate
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build

If database integration tests require a disposable database, use ONLY the established isolated test/Preview strategy.

Never point destructive tests at production.

Do not use:
prisma db push
prisma migrate reset

Do not apply anything to Halina v0.1-MAIN.

If this task requires no schema changes, say that explicitly.

If you discover that a schema change is truly required:
- prepare a normal forward-only Prisma migration
- review the generated SQL
- DO NOT deploy/apply it to production


==================================================
ACCEPTANCE CRITERIA
==================================================

This task is done only when:

1. Homepage live restaurant information updates without F5.
2. Returning to a hidden tab forces fresh state.
3. Manager elapsed queue/table/cleaning times continue increasing while idle.
4. Analytics with an ongoing session eventually recalculates without a DB mutation.
5. Visible times consistently use the restaurant timezone / Asia/Manila fallback.
6. Customer-created PENDING_APPROVAL reservations have working Manager Approve.
7. Manager can Reject a pending request.
8. Customer My Reservations reflects status changes clearly.
9. Approval/rejection uses the existing tenant-scoped production command architecture.
10. Reservation concurrency/capacity protection remains intact.
11. No private data is added to public realtime/customer projections.
12. A synthetic Data Lab example file exists in the repo with instructions.
13. Core stale docs accurately describe the current system.
14. Generated tsconfig build-info is no longer tracked if appropriate.
15. Lint, typecheck, tests, E2E and production build pass, or any environmental blocker is explicitly documented.


==================================================
DO NOT ADD IN THIS TASK
==================================================

Do NOT implement yet:

- AI/ML wait prediction
- SMS/email notifications
- customer reviews
- POS
- ordering
- inventory
- payroll
- accounting
- payments
- delivery
- full guest/no-account waitlist
- restaurant scheduling redesign
- unrelated visual redesign
- separate employee application

Do not turn this into a broad refactor.


==================================================
FINAL REPORT
==================================================

When finished, give me:

1. branch name
2. commits made
3. exact files changed
4. what now works
5. tests/build results
6. whether any migration was created
7. anything requiring Halina_Debug manual verification
8. anything intentionally deferred
9. the recommended next task after this one

Also include a concise demo script showing:

Manager browser
Customer browser
Staff browser

and what I should click in each to demonstrate the newly completed flow.

Do not merge or deploy. Stop after a reviewable branch is ready.