# Halina: Next Implementation Instructions for Codex

This AGENTS.md is the repository-level source of truth. Read it completely before planning or editing. It applies to the entire repository unless a more specific AGENTS.md exists deeper in the tree.

## 1. Current objective

Continue Halina from the completed manager operations vertical slice into a high-fidelity, manager-first restaurant operations prototype for the Philippine market.

The manager workspace is the product center. A manager should be able to design the restaurant floor, publish it, operate tables, manage the queue and reservations, view useful statistics, and manage staff records from one coherent application.

The signature feature is a Canva-like floor-plan editor. Prioritize it over adding broad secondary features.

Do not build or expand a separate employee application or employee login for this prototype. The manager performs live operations. Staff records and permissions belong under the manager Team section. Preserve the possibility of invitation- or PIN-based staff access in the domain model for later, but do not add another prominent application surface now.

Keep the customer experience public and lightweight. It must eventually read the same operational state as the manager workspace.

Do not add POS, payments, ordering, delivery, inventory, payroll, or accounting unless explicitly requested. Do not invent revenue statistics without POS data.

## 2. Branch and release reality

At the time this file was written:

- main contains the original architectural skeleton and the prior broad specification.
- Draft PR #1 contains the implemented manager operations slice.
- The implementation branch is agent/manager-operations-prototype at commit 6bd787df89e112a02de99e2132a95ead8c12c494.
- PR #1 targets main and is not merged.
- The implementation commit has a failing Vercel status.

Do not recreate the manager slice from the old main branch. Continue from the implementation in PR #1, or first bring that implementation into the active branch using a non-destructive workflow authorized by the user.

Do not merge PRs, change deployment settings, or deploy production without user authorization. You may diagnose and fix source-controlled deployment problems when implementation work is requested.

## 3. What already works on the implementation branch

Treat these as the baseline to preserve and extend:

- Next.js 15 App Router
- React 19
- strict TypeScript
- Tailwind CSS 4
- Supabase SSR authentication
- Prisma 7
- explicit NEXT_PUBLIC_HALINA_DEMO_MODE
- responsive manager shell and sidebar
- manager Overview
- interactive Live floor table-status changes
- valid table transition rules
- timestamped table events
- dining-session updates
- one canonical browser demo state
- localStorage persistence
- BroadcastChannel synchronization
- deterministic reset
- basic event-derived analytics
- safe internal login redirects
- lint, typecheck, Vitest, and build scripts

Do not replace these foundations wholesale. Extend the domain state, repository boundary, and tests.

## 4. Known weaknesses to address

### Release blockers

- PR #1 is still draft and unmerged.
- The Vercel status is failing.
- Generated Prisma code is ignored, but package installation does not currently guarantee prisma generate.
- Production environment variables may be absent or incorrect.

For source work, make a clean installation capable of generating Prisma and building. Prefer a postinstall or explicit build step that runs prisma generate while keeping generated output out of source control. Never commit secrets.

### Product gaps

- The floor-plan builder at /manager/layout is still a static legacy route.
- The Live floor uses seed geometry instead of a published floor-plan version.
- Queue and reservation records exist in demo state but lack complete manager workflows.
- Analytics are basic and lack periods, charts, queue metrics, and deeper table insights.
- Customer pages use separate hard-coded data.
- Prisma models only Profile; operations are browser-backed.
- Public signup still exposes unnecessary manager/employee role choices.
- A separate /employee surface still exists even though it is not part of the current prototype direction.
- Live duration labels may not update until another state change.
- End-to-end coverage and complete loading, empty, error, conflict, and stale states are missing.

## 5. Product information architecture

### Public customer surface

No login is required for browsing.

Keep:

- restaurant list or discovery
- restaurant detail
- current estimated wait
- crowd level
- walk-in availability
- last-updated timestamp
- stale-data warning

Only add Join queue if it works end to end with manager operations.

### Manager workspace

Use one authenticated manager application with:

- Overview
- Live floor
- Floor plans
- Queue and reservations
- Analytics
- Team
- Restaurant settings

The manager can perform all operational actions in the prototype.

### Team inside Manager

Add /manager/team for:

- staff directory
- name
- job title
- active/inactive state
- contact field only if necessary for the demo
- permission preset display
- add, edit, deactivate, and remove actions with appropriate confirmation
- future-access status such as Not invited or Access disabled

Do not build shift scheduling, payroll, attendance, or a separate employee dashboard.

Do not let public users self-register as employees. For this prototype, managers may maintain staff records without giving those staff members login access.

If later staff access is requested, use invitation or manager-issued quick PIN semantics and a restricted operations view. Do not add an independent product hierarchy that duplicates the manager tools.

## 6. Required implementation order

Keep the app runnable after every phase. Finish a vertical slice before beginning the next.

### Phase 0: stabilize and verify

1. Inspect the active branch and preserve unrelated work.
2. Install dependencies from a clean state.
3. ensure Prisma client generation occurs during clean install or build.
4. Run lint, typecheck, tests, and production build.
5. Diagnose the Vercel failure using real status/log evidence when available.
6. Fix source-controlled deployment issues.
7. Record environment or hosting blockers separately instead of masking them.

Exit criteria:

- npm run lint passes.
- npm run typecheck passes.
- npm test passes.
- npm run build passes from a clean installation.
- Prisma generated output remains ignored.
- No secrets are committed.
- The relevant deployment check is green, or the exact external blocker is documented.

### Phase 1: Canva-like floor-plan editor

Replace the static /manager/layout route with the flagship editor.

Desktop layout:

- top toolbar
- left object library
- center canvas
- right property inspector and layers panel
- zoom controls

Object library:

- round table
- square table
- rectangular table
- booth
- bar or counter
- wall
- door
- host stand
- waiting area
- kitchen/service area
- restroom marker
- column or obstacle
- text label
- zone

Use a stable logical canvas, such as 1600 by 1000 units. Persist x, y, width, height, rotation, zIndex, locked, visible, type, and object-specific properties. Zoom and pan must be viewport transforms and must not rewrite geometry.

Every dining table needs:

- stable operational ID
- visible label
- shape
- capacity
- minimum and maximum practical party size
- zone
- rotation
- active or archived state
- optional notes

Minimum editor interactions:

- create by drag/drop or clear click-to-add
- select
- shift-click multi-select
- marquee selection
- drag
- resize
- rotate
- duplicate
- delete
- undo and redo with at least 30 history entries
- keyboard arrow nudge
- Shift plus arrow larger nudge
- Escape to clear selection
- lock/unlock
- layers ordering
- bring forward/back
- align
- distribute for multi-selection
- grid toggle
- snap-to-grid toggle
- alignment guides
- zoom from 25% to 200%
- pan
- fit to screen
- editable inspector fields
- rename floor
- multiple saved floor plans or zones
- reliable Save draft
- dirty/saving/saved/error indication

Use accessible dialogs and toasts rather than native alert for core interactions. Provide keyboard focus and a synchronized layers/list panel so the canvas is not pointer-only.

Validation warnings:

- overlapping tables or objects
- objects outside bounds
- zero-capacity table
- duplicate active table labels
- plan with no entrance or host area
- unsaved changes
- deleting or archiving a table used by an active session or reservation

Show total active table count and calculated seating capacity.

#### Draft and publish semantics

A floor draft may change freely. Live floor must use only the active published version.

Publishing must:

- show a confirmation summary
- create an immutable version snapshot
- preserve stable table IDs when possible
- detect removed or materially changed active tables
- prevent silent loss of active sessions or reservations
- record publisher and timestamp
- update Live floor only after successful confirmation
- leave later edits in a new draft

Allow viewing, restoring, or duplicating an earlier version.

Keep the domain representation independent of the rendering library. A maintained React-compatible drag/resize or canvas package is acceptable. Do not write a fragile low-level pointer engine when a modest maintained dependency fits.

Phase exit criteria:

- a manager can create, move, resize, rotate, label, duplicate, and delete tables
- undo and redo work
- refresh preserves the draft
- publishing creates a version
- unpublished edits do not alter Live floor
- Live floor renders the published geometry
- editor state and version behavior have unit tests
- main editor actions are usable at desktop and tablet sizes
- no primary visible control is inert

### Phase 2: manager queue and reservations

Build /manager/queue or an equivalent manager route combining queue and reservation oversight.

Queue actions:

- add a walk-in
- edit party name, size, contact when needed, notes, and promised wait
- reorder parties
- mark called
- recommend suitable tables
- assign a table
- seat
- cancel
- mark no-show
- show elapsed and promised-wait timers
- prevent double seating

Queue states:

- WAITING
- CALLED
- SEATED
- CANCELLED
- NO_SHOW

A table recommendation must consider availability, capacity fit, zone notes, reservation conflicts, and idle time. Show a brief reason for the recommendation.

Seating must be one domain command that:

- validates the queue entry and table
- changes the queue entry to SEATED
- changes the table to OCCUPIED
- creates a dining session
- appends timestamped events
- updates Overview and Analytics through canonical state

Reservations need:

- list and simple day/calendar view
- date and time
- party name
- party size
- optional contact and notes
- status
- optional assigned table
- create/edit/cancel/no-show/arrived/seat actions
- capacity and scheduling conflict warnings

Reservation states:

- CONFIRMED
- ARRIVED
- SEATED
- COMPLETED
- CANCELLED
- NO_SHOW

Phase exit criteria:

- queue and reservation primary actions work
- timers update without unrelated state changes
- seating affects the table, queue, session, Overview, and Analytics together
- conflicts and invalid actions give useful feedback
- reducer/domain tests cover seating, cancellation, no-show, and conflicts

### Phase 3: Team inside Manager

Add the manager Team route and remove login bloat.

Required changes:

- add Team to manager navigation
- implement staff CRUD in demo state
- include simple permission presets such as Manager, Host, and Floor staff for future use
- make it clear that staff access is disabled/not invited in the prototype
- remove Employee as a public signup choice
- remove or de-emphasize links to /employee
- do not expand /employee
- preserve internal role compatibility only where removing it would cause unnecessary migration risk

Manager account creation must not let an arbitrary public user attach to another restaurant by typing a restaurant name. In demo mode, label shortcuts explicitly. In future database mode, an owner creates a restaurant and staff join only through an invitation or manager-issued access path.

### Phase 4: useful analytics

Expand /manager/analytics using pure calculations over sessions and timestamped events.

Required filters:

- Today
- Last 7 days
- Last 30 days
- custom date range
- zone
- table

Required metrics:

- table turns/frequency
- occupancy rate over the selected period
- seat utilization
- average and median dining duration
- cleaning turnaround
- table idle time
- queue actual wait
- promised-versus-actual wait accuracy
- abandonment/no-show rate
- busiest periods
- per-table comparison with restaurant average

Use Asia/Manila and restaurant operating hours. Active sessions must be handled intentionally. Empty data must show Not enough data rather than a misleading zero.

Add useful charts and a detailed table drawer or page, but always pair charts with readable labels or accessible data tables. Metrics must not be precomputed seed summaries.

Add rule-based operational insights such as:

- unusually slow cleaning
- underused table or zone
- recurring wait-estimate error
- poor capacity fit
- peak-period bottleneck

Each insight must name the metric, time range, and suggested action.

### Phase 5: customer consistency

Replace separate customer mock totals with selectors from the same canonical operational repository.

The customer surface must show:

- current wait estimate
- crowd level
- walk-in availability
- freshness timestamp
- stale/offline state

Manager changes should update the customer view in another tab through the existing synchronization mechanism. Do not expose private party names, contacts, notes, or internal staff information.

### Phase 6: production persistence and security

Only after the high-fidelity demo flows are coherent, expand Prisma and add a database-backed repository.

Expected models or equivalent domain structure:

- Profile
- Restaurant
- RestaurantMembership
- StaffMember or invitation/access record
- FloorPlan
- FloorPlanVersion
- FloorElement
- DiningTable identity
- TableStatusEvent
- TableSession
- QueueEntry
- QueueEvent when needed
- Reservation

Requirements:

- restaurant-scoped queries and mutations
- invitation-based staff membership
- no free-text tenant association
- server-side authorization
- transactions for multi-record operational commands
- idempotent profile provisioning
- safe internal redirects
- explicit demo/database repository boundary
- database migrations reviewed before destructive changes
- RLS or equivalent defense in depth if Supabase client access is used

Do not let route components import mutable mock arrays. Keep domain commands and analytics usable by both demo and Prisma repositories.

### Phase 7: quality and polish

Add or complete:

- loading states
- empty states
- validation errors
- persistence errors
- conflict states
- stale/offline states
- confirmation for destructive actions
- undo where sensible
- responsive desktop/tablet/mobile behavior
- keyboard and focus behavior
- WCAG 2.1 AA contrast and semantics
- accessible dialogs and charts
- deterministic demo reset
- README setup and route documentation
- clean deployment verification

Minimum end-to-end flow:

1. Enter explicit manager demo mode.
2. Create or edit a floor plan.
3. Add, move, resize, rotate, label, and duplicate a table.
4. Undo and redo.
5. Save the draft.
6. Publish the plan.
7. Confirm Live floor shows published geometry.
8. Add a walk-in party.
9. Seat it at a recommended available table.
10. Clear the table to Cleaning and then Available.
11. Confirm Overview and Analytics change.
12. Confirm customer wait/crowd information changes without leaking private data.
13. Refresh and confirm persistence.
14. Reset and confirm deterministic restoration.

## 7. Domain and state rules

Use canonical normalized state or equivalent repository-backed records. Do not store disconnected copies of queue totals, table totals, and analytics summaries.

All domain timestamps are ISO strings or Date values. Display formatting is centralized and timezone-aware.

Primary mutations are explicit domain commands, not arbitrary object edits. At minimum:

- saveFloorDraft
- publishFloorPlan
- transitionTable
- addQueueEntry
- updateQueueEntry
- callQueueEntry
- seatQueueEntry
- cancelQueueEntry
- markQueueNoShow
- createReservation
- updateReservation
- seatReservation
- completeReservation
- addStaffMember
- updateStaffMember
- deactivateStaffMember

Each operational command validates current state, appends the necessary event records, and updates every affected aggregate atomically within the chosen repository.

Keep table states:

- AVAILABLE
- HELD
- RESERVED
- OCCUPIED
- CLEANING
- OUT_OF_SERVICE

Preserve existing transition validation. Do not allow an OCCUPIED table to jump directly to AVAILABLE without clearing/cleaning semantics.

Archive historical table identities rather than deleting analytics history.

Version browser state and provide migration/fallback handling when the DemoState shape changes.

## 8. UX and visual direction

The manager product should feel like one application, not unrelated card pages.

Use:

- restrained cream/stone base
- emerald operational accent
- status colors with text/icons, never color alone
- clear hierarchy and compact operational density
- consistent buttons, inputs, badges, dialogs, drawers, toasts, tables, and empty states
- meaningful microcopy for managers
- Philippine locale and Asia/Manila time

Avoid:

- decorative KPIs without actions
- excessive gradients
- generic dashboard-template appearance
- native alert for core workflows
- tiny canvas controls
- horizontal page overflow outside intentional canvas/table regions
- placeholder statistics
- visible buttons that do nothing

On mobile, prioritize manager live operations, queue, and readable analytics. The full editor may be read-only or limited on small screens rather than forcing the desktop canvas into an unusable layout.

## 9. Engineering rules

- Preserve Next.js 15, React 19, Tailwind 4, Supabase SSR, Prisma 7, and strict TypeScript unless explicitly authorized otherwise.
- Do not commit generated Prisma output, .env files, secrets, node_modules, or build output.
- Use apply_patch for local manual file edits.
- Preserve unrelated teammate changes.
- Do not rewrite authentication or the app stack as a shortcut.
- Keep dependencies modest and intentionally selected.
- Add input validation at repository/server boundaries; Zod is acceptable.
- Do not use mutable singleton state in server modules.
- Use optimistic updates only with rollback and error feedback.
- Use accessible custom dialogs and toasts.
- Hide unavailable secondary controls instead of leaving no-op buttons.
- Keep fixtures deterministic.
- Keep code formatted for teammate review.
- Update tests with each domain change.
- Do not claim a placeholder screen is implemented.
- Do not deploy, merge a PR, send messages, or mutate production data without the required user authorization.

## 10. Verification

Before handing off any implementation, run:

- npm run lint
- npm run typecheck
- npm test
- npm run build

For deployment-related work, also verify a clean install and Prisma generation.

Minimum new unit coverage:

- floor editor selection and history
- draft persistence
- publish/version semantics
- active-table publish conflict
- queue entry creation/editing
- table recommendation rules
- atomic queue seating
- reservation conflict detection
- staff CRUD
- analytics date-range overlap
- median dining time
- cleaning and idle calculations
- promised-versus-actual wait
- abandonment
- browser-state migration/reset
- customer public selector privacy

Add end-to-end coverage for the full manager flow when the browser test setup is introduced.

## 11. Definition of done for this next implementation

The next high-fidelity milestone is complete only when:

- the release/build path is stable
- the manager Floor plans route is a functional Canva-like editor
- draft and published floor plans are distinct
- Live floor renders only the published version
- manager queue and reservation actions work end to end
- Team exists inside the manager workspace
- public employee registration and prominent employee navigation are removed
- no separate employee application was expanded
- analytics support meaningful periods and are event-derived
- per-table frequency, dining, cleaning, idle, and utilization metrics are visible
- customer wait/crowd information comes from the same safe operational source
- demo state persists, synchronizes, migrates, and resets
- primary visible controls work
- loading, empty, error, conflict, and stale states exist
- responsive and accessible behavior is credible
- lint, typecheck, tests, and build pass
- README describes actual behavior and limitations

## 12. Codex working behavior

When asked to implement, begin by stating the active branch, what is already implemented, and the vertical slice being attempted. Then inspect the relevant code before editing.

Make reasonable reversible design choices without repeatedly asking for permission. Pause when a choice changes core scope, destroys or replaces teammate work, introduces a paid service, stores new sensitive data, requires a destructive migration, merges a PR, or deploys externally.

At handoff, report:

1. what the manager can now do
2. what changed in customer behavior
3. what remains intentionally excluded
4. which metrics are calculated and from which events
5. important files changed
6. checks and exact results
7. deployment status when relevant
8. known limitations
9. the smallest sensible next step

Lead with working outcomes and be precise about anything still simulated.