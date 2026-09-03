# Staff work access

Halina does **not** create a separate employee account type. Staff members use the same personal Halina account they use anywhere else in the product.

## Identity and authorization

The manager-owned `StaffMember` record is the restaurant's staff directory and authorization record. A manager may attach a verified Halina account email to that record and enable work access. The normalized email is unique within a restaurant.

A signed-in user sees the **Work** entry point only when the verified email on the user's normal Halina account matches an active, non-archived, work-enabled `StaffMember` record.

The email match establishes **who the person is**. The restaurant's shared 4-digit staff PIN is a second gate used only to enter work mode. It is not an employee identifier and does not create an account or manager membership.

## PIN handling

- Each restaurant may configure one four-digit staff clock-in PIN.
- The PIN is stored only as a salted `scrypt` hash.
- Managers can replace the PIN but cannot retrieve the old plaintext value.
- PIN attempts are rate-limited per Halina profile and restaurant: five failed attempts within 15 minutes block further attempts for that window.
- Rotating the PIN affects future clock-ins. Already-active work sessions remain usable unless a manager explicitly clocks staff out.

Because the PIN has only 10,000 possible values, it must never be treated as sufficient authentication by itself. The server always requires both an authenticated, email-verified Halina user and a matching active staff whitelist record before testing the PIN.

## Clock-in session

Successful clock-in creates a server-side `StaffWorkSession` and sends the browser a random high-entropy session secret in an HTTP-only, SameSite=Lax cookie. Only the SHA-256 hash of that secret is stored in PostgreSQL.

The session has a 16-hour hard expiry. Closing the browser, locking the phone, losing battery, or restarting the device does not normally end it because the cookie persists until expiry. Explicit Halina logout or **Clock out** ends the server session and clears the browser cookie.

Every `/ops` request re-checks that:

1. the underlying personal Halina account is still authenticated and email-verified;
2. the work-session token is valid, active, and unexpired;
3. the session belongs to that Halina profile;
4. the `StaffMember` is still active and not archived;
5. work access is still enabled;
6. the staff whitelist email still matches the authenticated account's current verified email; and
7. the current manager-assigned permission preset allows the requested operation.

This means a manager can change role permissions or disable a staff record without waiting for the employee's browser session to expire.

## Permission ceiling

The current presets apply only to `/ops`:

- **Floor staff**: view Live Floor, change table status, view Queue.
- **Host**: Floor Staff permissions plus queue/contact management and seating.
- **Operations lead** (legacy enum value `MANAGER`): full staff operations ceiling, including recent-action correction when that command is implemented.

None of these presets grants `/manager`, Team, floor-plan editing, analytics, restaurant settings, owner onboarding, or tenant switching. Manager workspace authorization remains `RestaurantMembership` with `OWNER` or `MANAGER`.

## Manager controls

Manager > Team can:

- create and edit directory records;
- whitelist/remove a Halina email for work access;
- assign the operations permission preset;
- deactivate/reactivate or archive a staff record;
- force-clock-out one staff member;
- force-clock-out all staff; and
- set or rotate the restaurant PIN.

Changing the whitelist identity, disabling access, deactivating, or archiving a staff record terminates active work sessions for that staff record.

## Operational writes

Staff operations are tenant-scoped from the validated work session, never from a client-supplied restaurant ID. Table transitions and queue seating use database transactions and optimistic revision checks to prevent obvious cross-device double actions. Operational events record both the personal Halina profile and the restaurant `StaffMember` when the actor is clocked-in staff.

The initial `/ops` surface intentionally contains Live Floor and Queue only. It does not create a separate employee application.

## Database migration

The source migration `20260903130000_staff_whitelist_clock_in` adds the whitelist, hashed PIN, work-session, PIN-attempt, and staff audit fields. Committing the migration does not apply it to any environment; deploy/apply it only through the project's reviewed database migration process.
