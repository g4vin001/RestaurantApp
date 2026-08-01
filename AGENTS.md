# Halina: Repository Instructions for Codex

This file is the repository-level source of truth for Codex work. Read it before planning or editing. Apply it to the whole repository unless a more specific AGENTS.md is added deeper in the tree.

## 1. Product mission

Build Halina into a high-fidelity, end-to-end restaurant operations prototype for the Philippine market.

The manager experience is the primary product. Its signature feature is a Canva-like restaurant floor-plan editor that lets a non-technical restaurant manager create and publish an accurate operating layout. The layout is not decorative: employees use the published plan to operate tables and queues, and the app records events from those workflows so managers receive useful table, queue, wait-time, and occupancy analytics.

The prototype should feel complete and credible in a product demonstration. Most visible controls must work. Demo-backed behavior is acceptable where a production integration is not yet available, but inert buttons, static mock screens, misleading statistics, and placeholder-only routes are not acceptable.

Use the existing name Halina unless the task explicitly changes the brand.

## 2. Product priorities

Work in this order:

1. Manager application
   - overview and alerts
   - floor-plan editor
   - live floor operations
   - queue and reservation oversight
   - analytics and per-table insights
   - restaurant, hours, and team settings
2. Employee application
   - fast live table workflow
   - queue workflow
   - clear timers and status transitions
3. Customer application
   - restaurant discovery
   - credible current wait and crowd information
   - clear freshness and availability
4. Production hardening
   - persistent database repository
   - invitations and tenant security
   - realtime synchronization
   - deployment and observability

Do not expand into POS, payments, menu ordering, delivery, inventory, or accounting unless requested. Revenue metrics must not be invented without POS data.

## 3. Current repository reality

Audit baseline: main at commit 41322008805ff5756410cee38d911b11a65b5fcc.

The current repository is a clean architectural skeleton:

- Next.js 15 App Router
- React 19 and strict TypeScript
- Tailwind CSS 4
- Supabase SSR authentication
- Prisma 7 with Supabase PostgreSQL
- role-protected manager and employee layouts
- small reusable presentation components
- local restaurant, layout, queue, and analytics mock data

Preserve useful foundations instead of replacing the project wholesale. In particular, keep the Next.js App Router, TypeScript strict mode, Supabase authentication, Prisma, and current role-protected route concept.

The present product behavior is much less complete than the architecture suggests:

- Prisma defines only Profile.
- Profile.restaurant is free text and is not a tenant-safe relation.
- Restaurant, floor, table, session, queue, reservation, and analytics data are hard-coded.
- The layout builder is a static preview.
- Employee and queue buttons do nothing.
- Analytics are manually entered values rather than calculations.
- All restaurants share one layout.
- The public feed, employee view, and analytics can disagree because they read separate mock totals.
- There are no meaningful loading, empty, error, stale, save, or conflict states.
- There are no automated tests.
- The UI is a low-fidelity set of cards rather than a cohesive manager product.

Treat those points as implementation work, not documentation-only future work.

## 4. Weak-point audit and required response

| Severity | Area | Current weakness | Required direction |
|---|---|---|---|
| Critical | Tenant security | Anyone can self-select MANAGER or EMPLOYEE and type any restaurant name. | Keep this only as an explicitly labeled demo shortcut. Production-oriented flow must create a restaurant for an owner and use invitation-based memberships for staff. |
| Critical | Domain data | Prisma has no restaurant operations models. | Introduce a coherent domain model and repository boundary before pretending data is persistent. |
| High | Manager editor | Floor layout is static absolute-positioned markup. | Implement an interactive editor with creation, selection, drag, resize, rotate, properties, history, save, and publish. |
| High | Operations | Status and queue actions are inert. | Every primary action must mutate state and append a timestamped domain event. |
| High | Analytics validity | Metrics are hard-coded and have no source events. | Calculate metrics from table sessions, status events, queue events, and operating hours. |
| High | Access control | Restaurant association is free text; no membership relation or tenant scoping exists. | Model RestaurantMembership and scope every manager/employee query and mutation by restaurant. |
| High | Redirect safety | redirectTo comes from user input and is passed to redirect without an internal-path allowlist. | Add a safe internal redirect helper and reject external, protocol-relative, or malformed destinations. |
| Medium | Authentication consistency | Supabase account creation and Prisma profile creation can partially succeed. | Make profile provisioning idempotent and recoverable; document the boundary because cross-service atomic transactions are unavailable. |
| Medium | Navigation | Manager and Employee links appear to every visitor, regardless of role. | Render role-aware navigation and provide a dedicated manager sidebar or app shell. |
| Medium | Data consistency | Restaurant counts, queue counts, and analytics summary are separate manual values. | Derive summaries from one store/repository. Do not store duplicated calculated values unless intentionally cached. |
| Medium | Data freshness | Public data has a hard-coded old timestamp and no staleness behavior. | Show live, recently updated, or stale states based on real event timestamps. |
| Medium | Realtime | No synchronization or conflict strategy exists. | In prototype mode, synchronize browser tabs if practical. For production, isolate realtime behind the repository/service layer. |
| Medium | UX states | No toasts, confirmations, undo, empty states, or destructive-action safeguards. | Add complete interaction feedback and recoverability. |
| Medium | Accessibility | The visual canvas has no keyboard or screen-reader alternative. | Provide keyboard operations plus a synchronized list/layers view. |
| Medium | Maintainability | Many pages are compressed into one-line JSX and import mock data directly. | Format for review and move domain behavior out of route components. |
| Medium | Quality | No tests or scripted seed reset. | Add unit tests for reducers and analytics and a deterministic demo reset. |

Also preserve these strengths:

- server-side route guards
- compact, understandable component structure
- strict TypeScript
- clear status vocabulary
- simple setup documentation

## 5. Prototype operating mode

The high-fidelity prototype must be runnable without giving every reviewer access to production secrets.

Implement an explicit demo mode, never a silent authentication bypass:

- Use a clearly named environment switch such as NEXT_PUBLIC_HALINA_DEMO_MODE=true.
- When enabled, show a visible Demo data indicator and a role/restaurant switcher intended for development demonstrations.
- Persist mutations in versioned localStorage or IndexedDB so refreshes retain the demo state.
- Seed deterministic data covering at least 14 days, ideally 30 days, so analytics are meaningful.
- Include Reset demo data with confirmation.
- If multiple tabs are open, synchronize state with BroadcastChannel or the storage event when reasonable.
- When demo mode is false, role guards and normal data access must remain enforced.
- Do not put passwords, service keys, or private Supabase values in source control.

Use one domain interface for both demo and database-backed behavior. Pages must not directly import arrays from lib/mock-data.ts after the migration.

A suitable boundary is:

- restaurant repository
- floor-plan repository
- operations repository
- analytics service
- authentication/session service

The implementation may begin with a client-side demo repository, but domain types, events, and calculations must be usable later by a Prisma-backed repository.

## 6. Information architecture

### Manager app shell

Replace the three-card manager landing page with a cohesive authenticated app shell:

- collapsible left sidebar on desktop
- drawer or compact navigation on small screens
- restaurant switcher or restaurant identity at the top
- current open/closed state
- data freshness and save/sync state
- profile menu
- contextual page title and actions

Primary manager navigation:

- Overview
- Live floor
- Floor plans
- Queue and reservations
- Analytics
- Team
- Restaurant settings

Do not expose employee-only shortcuts as the primary manager information architecture. A manager may access live operations, but the manager shell should remain manager-focused.

### Employee app shell

The employee surface should be optimized for tablet and mobile speed:

- Live floor
- Tables list
- Queue
- Add walk-in
- compact current-shift summary

Do not show floor-plan editing or business analytics controls to employees.

### Customer surface

Keep the customer experience lightweight:

- searchable/filterable restaurant list
- current estimated wait
- crowd status
- walk-in availability
- last updated and stale-state treatment
- restaurant details
- optional Join queue prototype only if it can be made credible and connected to operations

## 7. Manager overview requirements

The manager overview must answer what needs attention now.

Include:

- current occupancy
- available, occupied, reserved, cleaning, and out-of-service counts
- active queue count
- current estimated wait
- longest-waiting party
- today's completed seatings
- today's average dining duration
- cleaning delay alert
- near-term reservations
- a compact live floor snapshot
- recent activity
- actionable insights

Examples of useful alerts:

- A table has been in Cleaning longer than the restaurant target.
- A party has exceeded its promised wait.
- A reserved table is still occupied near the reservation time.
- A table is out of service during a predicted peak.
- Wait estimate error has been high today.

Cards must link to the relevant table, queue entry, reservation, or analytics filter. Avoid decorative KPI cards that do not support a decision.

## 8. Canva-like floor-plan editor

This is the flagship feature and must receive the most interaction and visual design attention.

### Editor composition

On desktop, use a professional four-region editor:

1. Top toolbar
   - floor-plan name
   - draft/published state
   - saving/saved/error indicator
   - undo and redo
   - preview/live mode
   - publish
2. Left library
   - tables
   - counters and bars
   - host stand
   - waiting area
   - kitchen or service area
   - wall
   - door
   - restroom marker
   - column or obstacle
   - text label
3. Center stage
   - neutral restaurant canvas
   - optional grid
   - pan and zoom
   - snapping guides
   - marquee selection
4. Right inspector
   - selected item properties
   - layers/list view
   - alignment and arrangement controls
   - warnings

Include a bottom zoom control if it improves clarity.

On tablet, the stage remains usable with drawers for the library and inspector. On mobile, provide a safe read-only preview or limited property editing rather than forcing a cramped desktop canvas.

### Coordinate model

Do not store positions only as percentages.

Use a stable logical canvas such as 1600 by 1000 units and store:

- x
- y
- width
- height
- rotation
- zIndex
- locked
- visible
- element type
- element-specific properties

Render through a viewport transform so zoom does not alter stored geometry. Clamp items to the floor bounds unless a deliberate overflow behavior exists.

### Table properties

Each table needs:

- stable ID separate from display label
- label or number
- shape: round, square, rectangle, booth, bar seat group
- seat capacity
- minimum and maximum practical party size
- zone
- rotation
- color or style token
- active/out-of-service availability
- optional notes
- operational table identity used by analytics

Do not delete historical analytics when a table is removed from the active plan. Archive the table or preserve its historical ID.

### Editor interactions

At minimum, implement:

- drag from the library to create
- click to select
- shift-click and marquee multi-select
- drag to move
- resize handles
- rotation control
- keyboard arrow nudge
- shift-modified larger nudge
- duplicate
- copy and paste if feasible
- delete with undo
- lock and unlock
- bring forward, send backward, bring to front, send to back
- align left, center, right, top, middle, bottom
- distribute horizontally and vertically for multi-selection
- grid toggle
- snap-to-grid toggle
- snapping/alignment guides
- zoom from 25% to 200%
- pan
- fit to screen
- at least 30 undo/redo history entries
- dirty-state detection
- autosave or an explicit reliable Save draft action
- Publish with confirmation and a new immutable version
- restore or duplicate a previous version
- rename floor plans
- create more than one floor or zone

Keyboard shortcuts should include common conventions where they do not conflict with the browser: Delete/Backspace, arrows, Shift+arrows, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+D, and Escape.

Do not use native browser alert for core interactions. Use accessible dialogs and non-blocking toasts.

### Editor validation and feedback

Warn without unnecessarily blocking when:

- items overlap
- a table has zero seats
- two active tables have the same visible label
- an element extends outside the floor
- a floor has no entrance or host area
- the published plan has unsaved changes
- deleting or archiving a table affects current reservations or sessions

Show calculated floor capacity and table count while editing.

### Draft and publish semantics

A draft may change freely. Employees operate only on the active published version.

Publishing must:

- create a versioned snapshot
- preserve stable table identities when possible
- ask how to handle deleted/changed tables with active operational state
- update the live floor only after confirmation
- record who published and when

For the prototype, these semantics may be implemented in the demo store. They still need to be visible and testable.

### Implementation choices

Choose an interaction library intentionally. A DOM-based approach such as react-rnd plus focused selection/history logic is acceptable for this prototype. A canvas library is also acceptable if it supports text, accessibility fallbacks, reliable hit-testing, and exportable geometry.

Do not build a low-level drag/resize engine from scratch if a maintained library fits React 19. Keep the domain representation independent from the rendering library.

## 9. Live floor operations

The live floor is the published layout with operational status overlays.

Supported table states:

- AVAILABLE
- HELD
- RESERVED
- OCCUPIED
- CLEANING
- OUT_OF_SERVICE

Use an explicit transition function rather than arbitrary string replacement.

Typical transitions:

- AVAILABLE to HELD, RESERVED, OCCUPIED, or OUT_OF_SERVICE
- HELD to OCCUPIED or AVAILABLE
- RESERVED to OCCUPIED, AVAILABLE, or OUT_OF_SERVICE with confirmation
- OCCUPIED to CLEANING
- CLEANING to AVAILABLE
- OUT_OF_SERVICE to AVAILABLE

Each transition must append a TableStatusEvent with:

- restaurant
- table
- previous status
- new status
- occurredAt
- actor
- optional reason or note

When a party is seated, create a TableSession with party size and seatedAt. When the table is cleared, set clearedAt and move to Cleaning. When cleaning finishes, set readyAt and move to Available.

A table detail drawer should show:

- current state and timer
- capacity
- seated party
- session start
- expected end if available
- reservation conflicts
- recent status history
- quick actions
- note

Provide map and list views because employees should not be forced to use spatial navigation.

## 10. Queue and reservation workflow

### Queue

A manager or employee can:

- add a walk-in party
- record party name or short identifier
- record party size
- optionally record contact details
- select accessibility or seating notes
- set a promised wait
- edit an entry
- reorder with an explicit reason if needed
- notify or mark called in the prototype
- assign a suitable available table
- seat the party
- cancel or mark no-show
- view elapsed and promised-wait timers

Queue states:

- WAITING
- CALLED
- SEATED
- CANCELLED
- NO_SHOW

When seating a queue entry, the queue record and table session must update together in one domain command. The UI must prevent double-seating.

Recommend tables based on:

- table availability
- capacity fit
- zone notes
- reservation conflicts
- how long the table has been idle

Recommendations are advisory and explain why a table is suggested.

### Reservations

Implement a prototype reservation list/calendar sufficient for a credible demo:

- date
- time
- party
- party size
- contact
- notes
- status
- optional assigned table
- conflict indicator

Reservation states:

- CONFIRMED
- ARRIVED
- SEATED
- COMPLETED
- CANCELLED
- NO_SHOW

Do not attempt payments or third-party booking integrations.

## 11. Analytics requirements

Analytics must be computed from events and sessions. Never display a number merely because it appears in seed data as a summary.

All calculations use Asia/Manila time and restaurant operating hours. Date filtering must correctly handle sessions that overlap a range boundary.

### Required filters

- Today
- Yesterday
- Last 7 days
- Last 30 days
- Custom date range
- floor or zone
- table
- shift or time-of-day where data exists
- comparison with the immediately preceding equal-length period

### Core metrics

| Metric | Definition |
|---|---|
| Completed seatings or table turns | Count of table sessions seated in the selected range; expose per table and restaurant total. |
| Occupied minutes | Sum of the overlap between each session's occupied interval and the selected range. Active sessions end at now for current-period calculations. |
| Occupancy rate | Occupied table-minutes divided by active table-minutes during operating hours. Exclude archived or intentionally inactive tables. |
| Seat utilization | Guest count divided by seat capacity across sessions, reported as a weighted percentage. |
| Average dining duration | Mean of clearedAt minus seatedAt for completed sessions. |
| Median dining duration | Median of completed session durations; show this beside averages when outliers matter. |
| Cleaning turnaround | readyAt minus clearedAt for sessions that entered Cleaning. |
| Idle time | Available time between readyAt and the next seatedAt. |
| Average actual queue wait | seatedAt minus joinedAt for seated queue entries. |
| Promised-wait accuracy | Actual wait minus promised wait; report bias and mean absolute error. |
| Queue abandonment rate | Cancelled plus no-show waiting parties divided by queue entries resolved in the period. |
| Party-table fit | Party size divided by assigned table capacity, with under-filled large tables highlighted. |
| Peak period | Highest occupancy or seating volume using consistent 30-minute or 60-minute buckets. |

Handle empty denominators and insufficient data honestly. Use No data or Not enough data instead of zero when zero would be misleading.

### Analytics UI

The main analytics page should contain:

- top KPI row with comparison deltas
- occupancy over time
- queue size and wait time over time
- seatings by hour/day
- dining and cleaning duration distribution or trend
- table performance heatmap based on the published floor plan
- per-table sortable table
- queue outcomes
- generated operational insights
- clear date and zone filters

Clicking a table in the heatmap or performance table opens a detail view with:

- turns
- occupancy
- seat utilization
- average and median stay
- cleaning time
- idle time
- busiest periods
- comparison with restaurant median
- history chart

Generate insights from transparent rules, for example:

- Table 4 averages 16 minutes to clean, 42% slower than the restaurant median.
- Four-seat tables are used by parties of two or fewer 61% of the time during Friday dinner.
- Wait estimates have been 11 minutes too low on average between 7 PM and 8 PM.

Do not claim causal explanations that the data cannot prove.

### Seed data

Create deterministic seed data with:

- at least 8 to 12 tables of different capacities
- multiple zones
- realistic weekday and weekend differences
- completed and active sessions
- cleaning delays
- queue entries with seated, cancelled, and no-show outcomes
- reservations
- a few outliers that produce useful insights

The same seed must drive manager overview, live floor, employee operations, customer estimates, and analytics.

## 12. Customer wait-time estimate

For the prototype, calculate or suggest a wait estimate from operational data using an explainable heuristic:

- current queue parties ahead
- available capacity
- active table session ages
- typical duration by table capacity or time bucket
- upcoming reservation holds

Allow staff to override the estimate with a reason. Record automated suggestion, staff override, published value, actor, and timestamp so wait-estimate accuracy can be analyzed later.

Show customers:

- the published estimate as a range when uncertainty is meaningful
- number of parties waiting
- walk-in availability
- last updated
- stale-data warning
- a short explanation such as Based on the live queue and table availability

Do not promise exact seating times.

## 13. Suggested domain model

The exact schema may evolve, but preserve these concepts and relationships.

### Identity and tenancy

- Profile
  - Supabase user identity and display data
- Restaurant
  - name, slug, address, timezone, status, settings
- RestaurantMembership
  - restaurantId, profileId, role, status, invitedAt, acceptedAt
- RestaurantInvitation
  - restaurantId, email, role, token metadata, expiry, acceptedAt

Roles belong to a restaurant membership, not globally to an arbitrary restaurant name. A person may eventually belong to more than one restaurant.

### Layout

- FloorPlan
  - restaurantId, name, activeVersionId
- FloorPlanVersion
  - floorPlanId, version, status, logical width/height, createdBy, publishedAt
- FloorZone
  - versionId, name
- LayoutElement
  - versionId, zoneId, type, geometry, rotation, zIndex, locked, properties
- DiningTable
  - restaurantId, stable identifier, label, capacity, lifecycle status
- FloorPlanTable
  - versionId, diningTableId, geometry and visual properties if table elements are normalized separately

JSON properties are acceptable for flexible non-table visual elements, but frequently queried operational fields should be typed columns.

### Operations

- TableStatusEvent
- TableSession
- QueueEntry
- Reservation
- WaitEstimatePublication
- AuditEvent

Include createdAt and updatedAt where appropriate. Store timestamps in UTC and render in Asia/Manila.

Use enums or validated string unions consistently. Do not maintain unrelated duplicate TypeScript and Prisma enums by hand without a deliberate mapping layer.

### Indexes and constraints

Plan indexes for:

- restaurant plus time
- table plus time
- queue status plus joinedAt
- reservation restaurant plus scheduledAt
- active table state
- membership profile plus restaurant

Enforce tenant IDs in queries and uniqueness constraints such as restaurant plus table label where appropriate. Use transactions for multi-record operational commands.

## 14. Frontend architecture

Keep route components readable and move behavior into focused layers.

Suggested organization:

- app/manager
  - layout.tsx
  - page.tsx for Overview
  - floor/page.tsx for Live floor, or preserve /manager/layout if route compatibility matters
  - floor-plans/page.tsx or /manager/layout for editor
  - queue/page.tsx
  - analytics/page.tsx
  - team/page.tsx
  - settings/page.tsx
- app/employee
- components/manager
  - shell
  - overview
  - floor-editor
  - live-floor
  - analytics
- components/employee
- components/customer
- lib/domain
  - types
  - commands
  - transitions
  - analytics
  - wait-estimate
- lib/repositories
  - contracts
  - demo
  - prisma
- lib/demo
  - seed
  - store
  - persistence
- lib/auth
  - authorization
  - safe-redirect

Do not reorganize merely for aesthetics. Move files when it makes a completed feature easier to understand.

Use Server Components by default. Add Client Components only for interactive regions such as the editor, live store, charts, filters, dialogs, and forms.

Do not keep one huge manager component. Split by product responsibility, not by arbitrary visual fragments.

## 15. Visual design direction

The current emerald and cream identity is a useful starting point. Evolve it into a polished restaurant operations product rather than a generic admin template.

Design characteristics:

- warm off-white surfaces
- deep green primary actions
- charcoal text
- restrained amber, red, blue, and violet semantic colors
- high information density where managers need scanning
- generous touch targets in employee workflows
- subtle elevation and borders
- clear hierarchy
- consistent 8-point spacing
- professional icon set such as Lucide
- real chart components such as Recharts when a chart improves a decision
- skeletons for meaningful loading
- visible focus states
- no emoji as core interface icons
- no excessive gradients, glass effects, or decorative blobs

Create reusable tokens for:

- background and surface
- text and muted text
- border
- primary
- success
- warning
- danger
- information
- table states
- chart series
- radius and shadow

Use en-PH formatting and Asia/Manila time. Use Philippine peso formatting only for real monetary data.

Responsive expectations:

- manager overview and analytics work from 375-pixel mobile width upward
- full editor is optimized for at least 1024 pixels
- employee operations are excellent on mobile and tablet
- no horizontal page overflow except intentional table/canvas regions
- sticky toolbars must not hide content

## 16. Accessibility

Target WCAG 2.1 AA for conventional UI.

Required practices:

- semantic buttons and form labels
- visible keyboard focus
- status not communicated by color alone
- sufficient contrast
- accessible dialogs with focus management
- keyboard-operable editor actions
- reduced-motion consideration
- chart summaries or accessible data tables
- live-region announcements for saves and operational status changes
- 44-by-44-pixel touch targets for primary employee actions where practical

The canvas must have a synchronized list or layers panel so an element can be selected and edited without precise pointer input.

## 17. Implementation rules

- Preserve Next.js 15, React 19, Tailwind 4, Supabase SSR, Prisma 7, and strict TypeScript unless a task explicitly authorizes upgrades.
- Do not commit generated Prisma output, secrets, build output, or local environment files.
- Do not directly mutate exported mock arrays.
- Do not put mutable singleton application state in a server module.
- Keep domain timestamps as ISO/Date values, not display strings such as 11:45 AM.
- Centralize timezone-aware formatting.
- Validate user input at server or repository boundaries. Zod is acceptable.
- Validate internal redirects.
- Confirm destructive actions and offer undo when possible.
- Use optimistic updates only when rollback and error feedback exist.
- Avoid no-op buttons. If a secondary feature cannot be implemented, hide it or label it explicitly as unavailable in demo mode.
- Keep fixtures deterministic.
- Format JSX and logic for teammate review; avoid compressed one-line pages.
- Add comments only where the reason is not obvious from code.
- Do not use excessive abstractions before the second concrete use case.
- Avoid replacing the entire stack with a third-party dashboard template.
- Use maintained packages intentionally and keep the dependency list modest.

## 18. Work sequence for Codex

When asked to implement the high-fidelity prototype, proceed in vertical slices and keep the application runnable after each slice.

### Phase 0: establish the baseline

1. Inspect current files and git status.
2. Install dependencies.
3. Generate Prisma client when required.
4. Run lint and build.
5. Record pre-existing failures separately.
6. Do not delete teammate work.

### Phase 1: design system and manager shell

1. Create tokens, typography, buttons, inputs, badges, dialogs, toasts, tabs, and empty/loading states.
2. Build role-aware global navigation.
3. Build manager sidebar/header shell.
4. Replace the manager landing cards with a real Overview using one shared demo state.
5. Add responsive behavior.

### Phase 2: domain and demo repository

1. Define canonical domain types and transitions.
2. Create deterministic seed generator.
3. Create versioned browser persistence and reset.
4. Derive all summaries from that state.
5. Add event logging.
6. Add unit tests for transitions and derivations.

### Phase 3: floor-plan editor

1. Implement logical canvas and viewport.
2. Add library, selection, drag, resize, rotate, inspector, layers, zoom, and pan.
3. Add history, shortcuts, snapping, validation, and multi-select.
4. Add draft/publish/version flow.
5. Connect the published plan to live operations.
6. Add targeted tests.

### Phase 4: live operations and queue

1. Implement valid table status commands.
2. Implement sessions and timers.
3. Implement queue creation, editing, recommendation, seating, cancellation, and no-show.
4. Add reservation prototype and conflict warnings.
5. Make employee workflow fast and responsive.
6. Verify every event updates Overview and analytics.

### Phase 5: analytics

1. Implement pure calculation functions.
2. Add filters and comparison periods.
3. Add charts, heatmap, per-table table, and details.
4. Add rule-based insights.
5. Test boundary overlap, active sessions, empty data, and timezone behavior.

### Phase 6: customer consistency

1. Derive public wait/crowd data from the same operational state.
2. Show freshness and staleness.
3. Add a credible restaurant detail state.
4. Only add join-queue behavior if it is connected end to end.

### Phase 7: persistence and security

1. Expand Prisma schema with migrations.
2. Implement restaurant membership and invitation semantics.
3. Add tenant-scoped repository methods and server actions.
4. Make multi-record operations transactional.
5. Add RLS or equivalent defense-in-depth if Supabase client access is introduced.
6. Keep demo mode explicit and isolated.

### Phase 8: quality pass

1. Run lint, type checking, tests, and production build.
2. Check major flows at mobile, tablet, and desktop sizes.
3. Check empty, loading, error, stale, and no-data states.
4. Check keyboard interaction and focus.
5. Remove placeholder copy and dead controls.
6. Update README and docs to match actual behavior.

Do not stop after only restyling the static pages. A vertical slice is complete only when an interaction changes canonical state and the change appears everywhere it should.

## 19. Tests and verification

Add appropriate scripts if missing:

- typecheck
- test
- test:watch
- test:e2e when end-to-end coverage is introduced

Minimum unit coverage:

- valid and invalid table transitions
- seating a queue party
- clearing and cleaning a table
- floor editor history
- floor-plan publish semantics
- occupancy calculation
- session range overlap
- average and median duration
- queue wait and abandonment
- comparison-period calculation
- safe redirect validation
- seed determinism
- browser-store migration and reset

Minimum end-to-end demo flow:

1. Enter explicit manager demo mode.
2. Create or edit a floor plan.
3. Add, move, resize, rotate, label, and duplicate a table.
4. Undo and redo.
5. Publish the plan.
6. Open Live floor and see the published geometry.
7. Add a walk-in party.
8. Seat the party at an available table.
9. Clear the table, start Cleaning, then mark it Available.
10. Open Analytics and confirm the session and status timings affect the metrics.
11. Refresh and confirm demo state persists.
12. Reset demo data and confirm deterministic restoration.

Before handing off any implementation, run:

- npm run lint
- npm run typecheck if added
- npm test if added
- npm run build

If Supabase or database secrets are unavailable, verify demo mode and clearly report which production-backed checks could not run.

## 20. Definition of done for the high-fidelity prototype

The prototype is ready for review only when:

- the manager experience is a cohesive app rather than three disconnected cards
- the floor editor supports the core Canva-like interactions
- draft and published plans are distinct
- employees operate on the published plan
- primary employee and queue actions work
- operational changes generate timestamped events
- manager Overview reflects current state
- analytics are derived from event/session data
- table frequency/turnover and dining/cleaning metrics are visible per table
- analytics filters work
- the public wait state is consistent with operations
- demo data persists and can be reset
- responsive layouts are credible
- loading, empty, error, stale, and save states exist
- role-aware navigation exists
- no primary visible button is inert
- lint, type checking, tests, and build pass
- README accurately describes setup, demo mode, routes, and current limitations

## 21. Decisions requiring user confirmation

Continue with reasonable defaults for reversible UI and implementation choices. Pause for confirmation only when a decision would materially change product scope or destroy/replace existing work, including:

- changing the core stack
- deleting or rewriting authentication
- introducing a paid external service
- changing the product from walk-in operations to POS/reservations-first
- handling real customer communications
- storing new sensitive personal data
- destructive database migrations
- deploying or publishing externally

For normal implementation decisions, make the best repo-consistent choice, document it, and continue.

## 22. Expected handoff format

At the end of a Codex implementation task, report:

1. what a manager can now do
2. what an employee can now do
3. what a customer can now see or do
4. which metrics are real calculations and what events feed them
5. key files changed
6. verification commands and results
7. known limitations
8. the smallest sensible next step

Lead with the working outcome. Do not describe placeholder screens as implemented features.
