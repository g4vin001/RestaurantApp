# App flow

- Customer: browse LIVE restaurants, inspect the privacy-safe live floor, join the waitlist or request a reservation, then track personal waitlist/reservation status. Requests start as **Pending approval**.
- Owner/Manager: authenticate, select or create an authorized restaurant, and operate Overview, Live Floor, floor plans, Queue & reservations, Analytics, Team, and Settings. Pending reservation requests can be approved or rejected from Queue & reservations.
- Staff: redeem an email-bound, expiring invitation and use `/ops`. Server-side permissions restrict each staff account to approved Live Floor and Queue actions.
- Admin: unlock `/admin`; `/admin/data-lab` stages synthetic CSV/XLSX history for TEST restaurants, validates it, applies it atomically, and can revert only the linked synthetic rows.

Database mode loads and writes tenant-scoped PostgreSQL state through authenticated Prisma commands. Supabase Realtime carries privacy-safe invalidations, after which clients refetch canonical data. Explicit demo mode remains deterministic, browser-local, and separate.
