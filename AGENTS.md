# Halina: Shared-Data and Operations Usability MVP Instructions for Codex

This AGENTS.md is the repository-level source of truth. Read it completely before planning or editing. It applies to the entire repository unless a more specific AGENTS.md exists deeper in the tree.

## 1. Current objective

Convert the completed high-fidelity Halina prototype into a functional, shared, database-backed MVP without rebuilding the prototype or expanding into unrelated restaurant software.

The next milestone is not another visual redesign. It is reliable shared operations:

- restaurant data persists in PostgreSQL instead of only localStorage
- the same restaurant can be operated from multiple manager devices
- manager and public customer views use the same current operational state
- important multi-record changes are transactional
- every query and mutation is scoped to the authenticated manager's restaurant
- the deterministic browser demo remains available as an explicit, separate mode
- the release branch, public deployment, and automated tests are brought into a clean state

The manager workspace remains the center of the product. Staff records belong inside Manager > Team. Do not build a separate employee application or public employee login. The next access milestone is a restricted invitation- or PIN-based operations view for approved staff, limited to Live Floor and Queue actions; it must reuse the manager domain commands rather than duplicate the manager product.

Do not add POS, payments, ordering, delivery, inventory, payroll, accounting, or invented revenue statistics unless the user explicitly expands the scope.

## 2. Repository and release reality

Verify current GitHub and deployment state at the start of every task because branch and deployment status may have changed.

At the time of this update:

- the complete high-fidelity implementation is on agent/manager-operations-prototype
- the branch now includes auditable 15-minute table-action correction, combined same-zone table seating, a rush-mode queue form, explicit non-SMS "Mark called" wording, and party-size-aware wait suggestions
- draft PR #1 targets main and remains open
- main may still contain the older application skeleton even though it has the same AGENTS.md
- the production deployment at https://halina-self.vercel.app has been observed working
- Prisma client generation is already handled by the package.json postinstall script
- Prisma generated output remains ignored, as it should
- the app has lint, typecheck, Vitest, and production-build commands
- the current manager UI is still browser-backed through DemoProvider
- prisma/schema.prisma and the shared-data migration now contain the restaurant, membership, staff, floor, table, session, event, queue, and reservation foundation
- secure owner onboarding and membership-based manager guards exist, but normal manager operations are not yet connected to PrismaOperationsRepository
- app/employee/page.tsx is a static legacy placeholder

Do not recreate completed prototype features from stale main. If implementation begins from main and the manager prototype is absent, stop and report the branch mismatch. Continue from the implementation branch or bring it into the active branch only through a non-destructive workflow authorized by the user.

Do not merge PR #1, change production settings, run a destructive database migration, or deploy production unless the user has authorized that action. Source changes requested by the user may still be prepared and tested safely.

## 3. Completed baseline to preserve

Treat the following as implemented unless code inspection proves otherwise:

- responsive manager shell and navigation
- manager Overview
- Canva-like floor-plan editor
- draft saving and immutable publish versions
- published geometry rendered on Live floor
- table status rules and timestamped events
- dining-session lifecycle
- walk-in queue workflow
- table recommendations and seating
- reservation workflow and conflict feedback
- Team records and permission presets inside the manager workspace
- restaurant settings
- period, table, and zone analytics derived from operational events
- safe public customer projection
- explicit demo mode
- deterministic browser seed/reset
- localStorage persistence
- BroadcastChannel cross-tab synchronization
- Supabase SSR authentication
- safe internal login redirects
- Prisma generation during clean installation
- unit coverage for existing domain workflows
- auditable correction of a recent mistaken table transition, including linked queue/reservation rollback
- two-table same-zone recommendations and combined seating for larger parties
- queue rush mode with collapsed optional fields
- party-size-aware promised-wait suggestions
- explicit wording that Mark called does not send SMS

Preserve working UX, domain rules, analytics calculations, demo fixtures, and routes. Refactor behind repository boundaries where necessary, but do not replace the manager interface wholesale.

Before assuming a completed behavior is correct, perform a brief audit and run its tests. Fix confirmed defects; do not create parallel replacements.

## 4. Primary weaknesses to remove

### Release and access

- PR #1 is not yet the official main codebase.
- The legacy /employee route contradicts the manager-first product decision.
- A real restaurant owner does not yet have a complete, secure first-restaurant onboarding path.
- Deployment and dependency status must be rechecked from current evidence rather than assumed from old reports.

### Persistence and tenancy

- Operational records live in one browser.
- Clearing browser storage can erase the restaurant's operational history.
- Another manager device cannot reliably share the same floor, queue, reservations, or table states.
- Customer devices currently depend on browser demo data rather than a restaurant's server state.
- Team entries are records, not authenticated memberships or invitations.
- Profile contains a free-text restaurant field and a globally selected role.
- Prisma does not yet represent restaurants, floors, tables, sessions, queues, reservations, or events.
- Multi-record commands are atomic only inside a local reducer, not inside a database transaction.

### Reliability

- Concurrent devices can race to seat the same party or table.
- Browser-only BroadcastChannel is not real cross-device synchronization.
- No browser end-to-end suite covers the defining editor-to-operations workflow.
- Network, authorization, stale-data, transaction-conflict, and reconnect behavior require production-grade states.
- Restaurant hours still use one daily opening and closing time rather than weekday schedules, split shifts, overnight service, and exception dates.
- Restricted staff operational access is not implemented; managers still carry the full data-entry burden.
- Combined-table assignments work in demo operations, but the production schema and repository must persist the full table group rather than only one assigned table.
- Wait suggestions remain advisory until they are calibrated against persisted sessions, reservation pressure, and cleaning progress.
- Mobile rush operation needs browser verification on common restaurant tablets and phones.

## 5. Non-negotiable product structure

### Public customer surface

Public browsing requires no login. It may show only a privacy-safe restaurant projection:

- restaurant identity and public details
- walk-in availability
- estimated wait
- crowd level
- operating status
- last-updated time
- stale or offline warning

Do not expose party names, phone numbers, notes, reservation details, staff data, internal utilization data, or private operational events.

Do not add public Join queue unless it is deliberately requested and works end to end with anti-abuse, confirmation, privacy, and manager controls.

### Manager workspace

Keep one authenticated application containing:

- Overview
- Live floor
- Floor plans
- Queue and reservations
- Analytics
- Team
- Restaurant settings

The manager can perform all prototype operations. Multiple authenticated managers may eventually operate the same restaurant through restaurant memberships.

### Team

Team is a manager-owned staff directory. For this milestone:

- staff records can be created, edited, deactivated, and removed or archived
- permission presets may describe future access
- records should clearly indicate that login access is disabled or not invited
- staff do not self-register
- do not create a separate employee dashboard
- remove the legacy /employee page and all prominent links to it after confirming no required route depends on it
- managers may invite or enable selected staff for restricted operations access
- restricted staff access exposes Live Floor and Queue only, with explicit permission checks for status changes, seating, queue resolution, and corrections
- use RestaurantMembership plus expiring single-use invitations, or a securely hashed and rate-limited per-staff PIN where an invitation account is intentionally unnecessary
- record the acting membership on operational events

Authenticated staff access must use least-privilege permissions and a restricted operations route. It must not expose analytics, floor editing, Team administration, restaurant settings, owner onboarding, or tenant switching unless separately authorized.

## 6. Busy-shift usability requirements

Preserve and finish the operational improvements already started on the prototype branch.

### Correction and audit

- Live Floor must offer Correct last action only for the latest matching transition and only within 15 minutes.
- Require a human-readable reason and record it in audit history.
- A mistaken seating correction must remove the false dining session and restore a linked queue party or reservation.
- Combined seating correction must revert the whole linked table group atomically; never leave half of a group occupied.
- Production correction commands require membership authorization, an idempotency key, optimistic concurrency checks, and one database transaction.
- Do not offer arbitrary history rewriting. Older mistakes require a deliberate new status change or manager adjustment workflow.

### Rush mode

- Keep Rush mode optional and reversible.
- In Rush mode, expose party name, party size, suggested wait, Mark called, and Seat as the primary touch targets.
- Collapse contact, zone preference, notes, reordering, editing, cancellation, and no-show controls without removing access to them.
- Use large touch targets, clear confirmation feedback, and a direct Floor/Queue switch.
- Never discard optional values when Rush mode is toggled.

### Wait estimates

- Suggestions must be party-size-specific.
- Consider an immediately available fitting table or same-zone pair, active queue pressure, elapsed dining time, historical dining duration, cleaning target/progress, and near-term reservation conflicts.
- Show the suggestion as editable advisory guidance, not a guarantee.
- Explain when the result is coarse, stale, or missing enough history.
- Measure promised-versus-actual wait so later calibration is evidence-based.

### Combined tables

- Recommend at most a same-zone pair in the initial MVP unless the floor model gains explicit adjacency.
- Show every table label, combined capacity, spare seats, zone, and reservation risk before confirmation.
- Seating must occupy every selected table and create one linked party assignment while retaining per-table sessions/events for utilization analytics.
- Clearing, moving, correcting, and completing the party must keep the table group consistent.
- Persist the group in production with a join model or equivalent normalized relation; do not encode it as a comma-separated string.

### Communication wording

- Mark called changes operational status only.
- Never imply that SMS, email, or push notification was sent unless a configured provider confirms delivery.
- If messaging is added later, expose Pending, Delivered, and Failed outcomes separately from queue status.

### Schedules and mobile operation

- Replace the single daily hour pair with weekday schedules, closed days, split shifts, overnight ranges, and dated exceptions or holidays.
- Use Asia/Manila consistently and test ranges that cross midnight.
- Preserve the Live Floor list view as the phone fallback; the visual editor may remain tablet-landscape/desktop only.
- Verify queue and floor operations at 360 px phone width and common tablet widths with no hidden primary action.

## 7. Target architecture

Keep the domain layer independent from storage and React.

Use one operations interface implemented by two explicit repositories:

### DemoOperationsRepository

- uses deterministic fixtures and versioned browser persistence
- remains enabled only by the explicit demo-mode configuration
- continues cross-tab synchronization
- never silently writes demo state into production tables
- supports reset for reviewers
- clearly labels the UI as Demo mode

### PrismaOperationsRepository

- uses PostgreSQL through Prisma
- resolves the authenticated user and active restaurant on the server
- scopes every read and write by restaurantId
- uses transactions for multi-record commands
- returns validated domain results or typed errors
- is the default repository in authenticated non-demo operation

Domain commands and analytics selectors must work against shared domain types rather than importing localStorage or Prisma directly.

Preferred dependency direction:

1. route or UI invokes a typed application command
2. server boundary authenticates and authorizes the request
3. domain command validates the requested transition
4. repository executes the change, using a transaction where needed
5. the server returns a normalized result
6. the client reconciles optimistic state or displays a useful error
7. subscribed clients receive the resulting change

Do not let route components mutate database rows directly. Do not put mutable singleton state in server modules.

## 8. Required Prisma/domain model

Adapt names to the existing conventions, but preserve these concepts.

### Identity and tenancy

#### Profile

- id matching the Supabase Auth user UUID
- email and display name
- createdAt and updatedAt
- no free-text restaurant association
- no client-controlled global manager or employee privilege

If the existing Role enum cannot be removed safely in the first migration, stop using it for authorization and migrate it deliberately later.

#### Restaurant

- id
- slug or other public identifier
- name
- timezone, default Asia/Manila
- locale, default en-PH or the chosen Philippine locale
- operating settings
- walk-in availability
- createdAt and updatedAt

#### RestaurantMembership

- restaurantId
- profileId
- role such as OWNER or MANAGER
- active state
- createdAt and updatedAt
- unique restaurantId plus profileId

Authorization must come from membership, not from a client-supplied restaurant ID or a Profile role string.

#### StaffMember

Use a separate staff record when the person has no login:

- restaurantId
- name
- job title
- contact only when necessary
- permission preset label
- active or archived state
- optional future membership or invitation link
- createdAt and updatedAt

Do not require every staff directory entry to have an account.

#### Invitation

Add only if authenticated manager invitations are implemented in this milestone:

- restaurantId
- normalized recipient
- intended membership role
- hashed single-use token
- expiry
- invitedBy
- acceptedAt or revokedAt

Never store a reusable invitation token in plain text.

### Floor planning

#### FloorPlan

- restaurantId
- name
- current draft identity or draft metadata
- active published version identity
- archived state
- createdAt and updatedAt

#### FloorPlanVersion

- floorPlanId
- immutable version number
- status or publication metadata
- createdBy and publishedBy
- createdAt and publishedAt
- immutable snapshot or related version elements

Published versions must not be edited in place.

#### FloorElement

- floorPlanVersionId
- stable element identity where appropriate
- type
- x, y, width, height, rotation, and zIndex
- locked and visible
- label, zone, and type-specific properties
- JSON only for genuinely variable presentation properties

#### DiningTable

Separate the durable operational table identity from one version's geometry:

- restaurantId
- stable label
- capacity and practical party-size range
- zone
- active or archived state
- current status
- current floor element/version mapping
- optimistic concurrency field or updatedAt

Publishing should reuse a DiningTable identity when the logical table is preserved and archive identities only when intentionally removed.

### Operations

#### TableStatusEvent

- restaurantId
- diningTableId
- fromStatus
- toStatus
- occurredAt
- actor profile when available
- source command ID
- optional reason
- indexes for restaurant/time and table/time

#### DiningSession

- restaurantId
- diningTableId
- queue entry or reservation source when applicable
- party size
- seatedAt
- clearedAt
- cleaningStartedAt
- availableAt or completedAt
- status
- createdAt and updatedAt

#### QueueEntry

- restaurantId
- party name
- party size
- privacy-sensitive contact only if needed
- notes
- status
- promised wait minutes
- joinedAt, calledAt, seatedAt, cancelledAt, and noShowAt
- assigned table when applicable
- source and createdBy
- createdAt and updatedAt

#### Reservation

- restaurantId
- party name
- party size
- privacy-sensitive contact only if needed
- notes
- scheduledAt
- status
- assigned table when applicable
- arrivedAt, seatedAt, completedAt, cancelledAt, and noShowAt
- createdAt and updatedAt

Add QueueEvent or ReservationEvent when audit history cannot be represented clearly by timestamps alone. Avoid event tables that merely duplicate rows without a query or audit purpose.

### Constraints and indexing

At minimum:

- composite tenant indexes beginning with restaurantId
- unique floor version number within a plan
- unique active table label within the intended restaurant or floor scope
- unique membership per restaurant and profile
- indexes supporting analytics by restaurantId and occurredAt
- indexes supporting active queue and reservation lookups
- referential behavior that preserves analytics history
- archival rather than destructive deletion for tables used by sessions or events

Use database constraints where practical, but keep domain validation for useful user-facing feedback.

## 9. Secure manager onboarding and authorization

Do not restore a public role selector.

A legitimate self-service owner flow may:

1. authenticate or create a normal account
2. enter a dedicated restaurant setup flow
3. create a new Restaurant
4. create an OWNER membership for that same authenticated profile in one transaction
5. create default settings and an empty initial floor draft
6. redirect into that new restaurant's manager workspace

A user must never join an existing restaurant by entering its name. Joining an existing restaurant requires a valid invitation or an administrator-controlled path.

Every manager server action or route must:

- resolve the authenticated Supabase user on the server
- load an active RestaurantMembership
- validate the requested restaurant belongs to that membership
- enforce OWNER-only operations where needed
- ignore client attempts to substitute another restaurantId
- validate input at the boundary; Zod or an equivalent schema is acceptable
- return typed unauthorized, forbidden, validation, conflict, and persistence errors

Use Supabase Row Level Security or equivalent defense in depth if client-side Supabase queries are introduced. Server-side checks remain mandatory even with RLS.

Profile creation must be idempotent. Redirect targets must remain internal and validated.

## 10. Transaction-safe application commands

Preserve current domain state rules. Move these commands behind authenticated server boundaries and database transactions.

### publishFloorPlan

In one transaction:

- verify manager access
- validate the draft
- detect active-session or reservation conflicts
- create an immutable FloorPlanVersion
- create its FloorElements
- reuse or create durable DiningTable identities
- archive only tables intentionally removed
- set the new active published version
- record publisher and time

Unpublished edits must not affect Live floor.

### transitionTable

- verify membership and current table version/status
- enforce allowed transitions
- append TableStatusEvent
- create or update the DiningSession lifecycle as appropriate
- reject stale concurrent transitions with a conflict response

Do not allow OCCUPIED directly to AVAILABLE without the intended clear and cleaning lifecycle.

### seatQueueEntry

In one transaction:

- lock or conditionally update the active QueueEntry and DiningTable
- confirm the entry is still WAITING or CALLED
- confirm the table is still suitable and available
- change the entry to SEATED
- change the table to OCCUPIED
- create a DiningSession
- append table and queue audit data
- return the new canonical state

Two devices must not be able to seat the same party or claim the same table.

### seatReservation

Apply the same atomicity and conflict behavior to a valid arrived or confirmed reservation.

### cancel and no-show commands

Update the queue or reservation status and release any HELD or RESERVED table consistently in one transaction.

### Team and settings commands

Scope all changes to the active restaurant and record the acting manager where useful.

Use idempotency or command IDs for mutations that may be retried after a network interruption. Use optimistic UI only when rollback and failure feedback are implemented.

## 11. Real-time multi-device synchronization

After database persistence works correctly without subscriptions, add real-time updates.

Prefer Supabase Realtime because Supabase is already in the stack, but keep the domain repository independent of the transport.

Requirements:

- subscribe only to the active restaurant's authorized data
- perform an initial canonical fetch
- subscribe and reconcile missed updates rather than trusting subscription order blindly
- update Live floor, Overview, Queue, Reservations, Analytics freshness, and the public projection
- unsubscribe when restaurant context changes or the component unmounts
- reconnect with backoff
- show reconnecting, offline, and stale states
- refetch after reconnect
- deduplicate events by durable IDs
- handle updates arriving out of order
- do not broadcast private records to public customer clients
- retain BroadcastChannel only for demo mode or harmless local coordination

For conflicting manager actions, the server result wins. Display a clear message such as “This table was changed on another device” and refresh the affected record.

Avoid subscribing every screen to every raw table. Use a small number of restaurant-scoped streams or a server-created public projection appropriate to the data volume and privacy model.

## 12. Customer/manager consistency

The public restaurant page must derive from the same database-backed operational state while exposing only safe aggregates.

Calculate or store a public projection containing:

- current walk-in availability
- estimated wait
- crowd level
- open or closed state
- last meaningful operational update
- stale threshold

The wait estimator should initially be deterministic and explainable. It may use:

- waiting party sizes
- compatible table capacities
- active table progress where known
- recent median dining duration by relevant table or zone
- recent cleaning duration
- near-term reservation conflicts

Do not introduce machine learning until sufficient real production data exists and its improvement can be measured.

Manager changes must become visible to a customer on another device within a reasonable real-time interval. Customer clients must never receive raw queue entries, reservations, session notes, contacts, or staff data.

## 13. Analytics after persistence

Reuse the existing pure analytics logic where possible. Change the data source from demo events to tenant-scoped database records.

Preserve:

- Today, last 7 days, last 30 days, and custom range
- table and zone filters
- table frequency or turns
- occupancy
- seat utilization
- average and median dining duration
- cleaning turnaround
- idle time
- queue wait
- promised-versus-actual wait accuracy
- abandonment and no-show rates
- busiest periods
- per-table comparisons and operational insights

Requirements:

- use restaurant timezone, default Asia/Manila
- define interval boundaries consistently
- handle active sessions intentionally
- show Not enough data instead of misleading zeroes
- avoid loading unbounded history into the browser
- query only the needed period and restaurant
- add indexes based on actual query plans
- keep formulas covered by unit tests
- never infer revenue without POS data

Precomputed summaries are optional only after correctness is established and measurement shows raw queries are too slow.

## 14. Demo-to-production separation

Do not silently reinterpret existing localStorage data as production truth.

- Demo mode remains deterministic and browser-local.
- Database mode reads and writes only the authenticated restaurant.
- Show the active mode clearly.
- Version demo state and retain safe migration/reset behavior.
- If a demo-to-database import is added, make it an explicit manager action with a preview, validation, and duplicate handling.
- Production logout must not erase server data.
- Demo reset must never touch production tables.

Keep a single feature/configuration boundary that chooses the repository. Avoid sprinkling demo checks throughout page components.

## 15. Implementation order

Keep the app runnable after every phase. Complete and verify one vertical slice before beginning the next.

### Phase 0: release and baseline cleanup

1. Resolve the active branch and confirm the high-fidelity implementation is present.
2. Inspect PR #1 and the latest Vercel deployment.
3. Run a clean install and all current checks.
4. Inspect current dependency advisories, including any PostCSS or Sharp findings, and apply the smallest compatible fixes supported by the actual advisory.
5. Remove the legacy /employee route and its links after verifying no required code depends on it.
6. Document the current demo-manager access path.
7. Do not merge or deploy without authorization.

Exit criteria:

- the active branch contains the complete prototype
- npm run lint passes
- npm run typecheck passes
- npm test passes
- npm run build passes
- Prisma generation succeeds during clean install
- no legacy employee entry point remains
- current deployment or external blocker is documented accurately
- no secrets are committed

### Phase 1: schema and tenant foundation

1. Add Restaurant, RestaurantMembership, StaffMember, FloorPlan, FloorPlanVersion, FloorElement, DiningTable, TableStatusEvent, DiningSession, QueueEntry, and Reservation.
2. Remove authorization dependence on Profile.role and Profile.restaurant.
3. Add safe enums, relationships, indexes, timestamps, and archival behavior.
4. Create and review a migration.
5. Add deterministic database seed helpers for development only.
6. Add repository integration tests against a disposable test database where practical.

Exit criteria:

- migration applies to a clean database
- existing profile data has an explicit migration path
- destructive or ambiguous migrations are not applied automatically
- tenant constraints and indexes exist
- Prisma client generation, typecheck, tests, and build pass

### Phase 2: onboarding and repository boundary

1. Implement secure first-restaurant creation.
2. Add active restaurant membership resolution.
3. Introduce DemoOperationsRepository and PrismaOperationsRepository behind one interface.
4. Move read paths to the repository without changing visible manager behavior.
5. Add typed server validation and authorization errors.

Exit criteria:

- an authenticated owner can create only a new restaurant or access an authorized membership
- changing a client restaurant ID cannot cross tenants
- demo mode behaves as before
- non-demo mode loads the authenticated restaurant from PostgreSQL

### Phase 3: transactional operations

Move and verify, in this order:

1. floor draft save and publish
2. table transitions and dining sessions
3. queue creation, recommendation, seating, cancellation, and no-show
4. reservation creation, arrival, seating, completion, cancellation, and no-show
5. Team and restaurant settings
6. database-backed analytics reads

Exit criteria:

- refresh and logout/login preserve restaurant state
- concurrent seating cannot double-book a table or party
- manager pages use canonical database state
- transaction failures leave no partial updates
- typed conflict and persistence feedback is visible

### Phase 4: real-time and customer projection

1. Add authorized restaurant-scoped manager subscriptions.
2. Add privacy-safe public projection updates.
3. Add reconnect, stale, offline, and conflict recovery.
4. Verify manager-to-manager and manager-to-customer propagation on separate browser contexts.

Exit criteria:

- a change on one manager device appears on another
- public wait/crowd data updates without private-data leakage
- missed connection periods recover through refetch
- demo BroadcastChannel behavior still works separately

### Phase 5: browser end-to-end coverage

Introduce Playwright or the repository's chosen browser runner.

Required flows:

1. owner creates or selects a restaurant
2. manager creates or edits a floor plan
3. manager adds, moves, resizes, rotates, labels, and duplicates a table
4. manager saves draft and publishes
5. another manager context sees the published Live floor
6. manager adds a walk-in and seats it at a suitable table
7. a simultaneous conflicting seat attempt is rejected
8. manager clears the table, completes cleaning, and returns it to Available
9. Overview and Analytics update
10. public customer wait/crowd information updates
11. refresh and a new browser context preserve state
12. tenant A cannot read or mutate tenant B
13. demo reset remains deterministic and does not affect production data

Test desktop manager operations, tablet layouts, and mobile public pages. The full floor editor may remain limited on narrow mobile screens if the limitation is explicit and the read-only experience is usable.

### Phase 6: release readiness

1. Resolve remaining loading, empty, network, authorization, conflict, and stale states.
2. Verify keyboard and focus behavior.
3. Verify WCAG 2.1 AA contrast and semantic labels.
4. Re-run dependency and security audits.
5. Update README with actual setup, migrations, demo mode, routes, tests, deployment, and limitations.
6. Verify the intended Vercel deployment after authorization.
7. Merge the implementation branch only after checks and explicit authorization.

## 16. Testing requirements

Before handing off any implementation, run:

- npm run lint
- npm run typecheck
- npm test
- npm run build

Also run when relevant:

- clean npm installation to prove postinstall Prisma generation
- migration validation on a disposable or development database
- repository integration tests
- Playwright end-to-end tests
- dependency audit with exact advisory review
- deployed smoke test after an authorized deployment

Minimum new unit or integration coverage:

- restaurant creation and owner membership
- membership-based tenant authorization
- cross-tenant denial
- floor version publishing and active-table conflicts
- durable table identity across floor versions
- valid and invalid table transitions
- atomic queue seating
- simultaneous seating conflict
- atomic reservation seating
- cancellation and no-show table release
- idempotent mutation retry
- analytics tenant and date filtering
- public selector privacy
- reconnect/refetch reconciliation
- demo/database repository selection

Tests must prove observable behavior. Do not weaken assertions, bypass authorization, or replace database behavior with mocks merely to make a failing test green.

## 17. UX and error behavior

Preserve the existing cream/stone and emerald visual direction.

Every server-backed screen must distinguish:

- initial loading
- no data
- saving
- saved
- validation failure
- unauthorized or forbidden
- concurrent-update conflict
- network or persistence failure
- reconnecting
- offline
- stale data

Use accessible dialogs, drawers, and toasts. Do not use native alert for primary workflows. Do not leave visible no-op buttons.

Optimistic interactions must:

- retain a client mutation ID
- show a pending state
- reconcile with the canonical server response
- roll back or refetch after failure
- explain conflicts in manager language

Use status text/icons in addition to color. Preserve Philippine locale and Asia/Manila time handling.

## 18. Engineering and safety rules

- Preserve Next.js 15, React 19, Tailwind CSS 4, Supabase SSR, Prisma 7, strict TypeScript, Vitest, and react-rnd unless a verified incompatibility requires change.
- Keep dependencies modest and justify new infrastructure.
- Never commit .env files, secrets, service-role keys, generated Prisma output, node_modules, or build output.
- Never expose a Supabase service-role key to the browser.
- Use server-only modules for privileged database access.
- Validate at all external and server boundaries.
- Scope every production repository operation by restaurant membership.
- Use transactions for multi-record domain commands.
- Use archival instead of deleting history required by analytics.
- Review migrations before applying destructive changes.
- Preserve unrelated teammate changes.
- Use apply_patch for local manual edits.
- Do not rewrite authentication or the application stack as a shortcut.
- Do not add a second state store that can drift from the canonical repository.
- Do not claim localStorage synchronization is multi-device real time.
- Do not claim seeded or simulated results are production data.
- Do not deploy, merge, send external messages, or mutate production data without the required authorization.

When blocked by unavailable credentials or hosting access, finish all safe source work, document the exact required variables or external step, and stop without inventing values.

## 19. Definition of done for the shared-data MVP

This milestone is complete only when:

- the high-fidelity manager prototype is preserved
- the legacy employee route and public employee login path are gone
- approved staff can use a restricted invitation- or PIN-based operations surface without a separate employee application
- a legitimate owner can create a new restaurant securely
- managers access restaurants through verified memberships
- restaurant operations persist in PostgreSQL
- all production reads and writes are tenant-scoped
- floor drafts and immutable published versions persist
- durable table identities survive floor versions
- table events and dining sessions persist
- queue and reservation workflows are transaction-safe
- table corrections and combined-table lifecycle changes are transaction-safe and auditable
- weekday, overnight, split-shift, and exception schedules are supported
- two devices cannot double-seat a party or table
- manager devices receive real-time updates
- the public customer view receives fresh privacy-safe aggregates
- reconnect, offline, stale, conflict, and persistence-error states work
- demo mode remains explicit, deterministic, isolated, and resettable
- analytics read actual restaurant events with correct date and tenant filters
- browser end-to-end tests cover the defining workflow and tenant isolation
- clean install, lint, typecheck, unit/integration tests, end-to-end tests, and build pass
- dependency advisories have been reviewed and resolved or documented
- README accurately describes current behavior and limitations
- the intended deployment is healthy after an authorized release
- the implementation branch is merged into main after explicit authorization

## 20. Codex working behavior

When asked to implement:

1. state the active branch and confirm the high-fidelity prototype is present
2. identify the smallest complete vertical slice from the implementation order
3. inspect the relevant code and tests before editing
4. preserve working prototype behavior
5. make reasonable reversible choices without repeated clarification
6. pause for destructive migrations, production data changes, paid services, branch merges, deployments, or core scope changes
7. run the relevant verification
8. report exact outcomes and limitations

At handoff, report:

- which busy-shift improvements are fully implemented and which remain advisory or demo-only
- what is now stored in the database
- which operations are transactional
- which views synchronize across devices
- how tenant authorization was verified
- what remains in demo mode
- migrations created or applied
- important files changed
- exact check and test results
- deployment status when relevant
- the smallest sensible next step

Lead with working outcomes. Be explicit whenever behavior is still simulated, browser-local, untested across devices, or blocked by external configuration.
