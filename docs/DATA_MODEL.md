# Data model

- Identity and tenancy: `Profile`, `Restaurant`, and `RestaurantMembership`. Authorization comes from an active membership, never a client-supplied restaurant ID.
- Staff access: `StaffMember`, restricted `StaffRole` permissions, hashed single-use `StaffInvite` credentials, and invite attempt limits.
- Floor planning: mutable `FloorPlan` drafts, immutable `FloorPlanVersion` snapshots, `FloorElement` geometry, and durable `DiningTable` identities.
- Operations: revisioned `QueueEntry` and `Reservation` rows, `DiningSession`, `TableStatusEvent`, and normalized `SeatingAssignment` groups for atomic combined-table service.
- Reliability: `OperationCommand` records idempotent commands; audit rows retain actor and reason. Realtime messages contain invalidation identifiers only.
- Data Lab: `SyntheticImportBatch` and source-row links isolate staged/applied TEST data from LIVE restaurants.

Customer reservation status flows `PENDING_APPROVAL → CONFIRMED → ARRIVED → SEATED → COMPLETED`; rejection uses `CANCELLED`. Pending and confirmed requests reserve capacity, while cancelled, completed, and no-show records do not. Domain-facing types live under `lib/domain`; the authoritative database shape is `prisma/schema.prisma`.
