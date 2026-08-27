-- Shared operations, restricted staff access, and TEST data-lab foundation.
-- This migration preserves existing operational history and backfills legacy
-- staff invitations into a safely revoked state when no verified email exists.

CREATE TYPE "StaffPermission" AS ENUM (
  'VIEW_LIVE_FLOOR',
  'CHANGE_TABLE_STATUS',
  'VIEW_QUEUE',
  'VIEW_CONTACT_DETAILS',
  'MANAGE_QUEUE',
  'SEAT_PARTIES',
  'CORRECT_RECENT_ACTION'
);
CREATE TYPE "RestaurantEnvironment" AS ENUM ('LIVE', 'TEST');
CREATE TYPE "SeatingAssignmentStatus" AS ENUM ('ACTIVE', 'CLEARING', 'COMPLETED', 'CORRECTED');
CREATE TYPE "ImportBatchStatus" AS ENUM ('STAGED', 'APPLIED', 'REVERTED');

ALTER TABLE "Restaurant"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "environment" "RestaurantEnvironment" NOT NULL DEFAULT 'LIVE',
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "StaffRole" (
  "id" UUID NOT NULL,
  "restaurantId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "permissions" "StaffPermission"[] NOT NULL DEFAULT ARRAY[]::"StaffPermission"[],
  "presetKey" TEXT,
  "archivedAt" TIMESTAMP(3),
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffRole_pkey" PRIMARY KEY ("id")
);

INSERT INTO "StaffRole" ("id", "restaurantId", "name", "permissions", "presetKey")
SELECT gen_random_uuid(), r."id", 'Floor Staff',
  ARRAY['VIEW_LIVE_FLOOR','CHANGE_TABLE_STATUS','VIEW_QUEUE']::"StaffPermission"[],
  'FLOOR_STAFF'
FROM "Restaurant" r;
INSERT INTO "StaffRole" ("id", "restaurantId", "name", "permissions", "presetKey")
SELECT gen_random_uuid(), r."id", 'Host',
  ARRAY['VIEW_LIVE_FLOOR','CHANGE_TABLE_STATUS','VIEW_QUEUE','VIEW_CONTACT_DETAILS','MANAGE_QUEUE','SEAT_PARTIES']::"StaffPermission"[],
  'HOST'
FROM "Restaurant" r;
INSERT INTO "StaffRole" ("id", "restaurantId", "name", "permissions", "presetKey")
SELECT gen_random_uuid(), r."id", 'Shift Lead',
  ARRAY['VIEW_LIVE_FLOOR','CHANGE_TABLE_STATUS','VIEW_QUEUE','VIEW_CONTACT_DETAILS','MANAGE_QUEUE','SEAT_PARTIES','CORRECT_RECENT_ACTION']::"StaffPermission"[],
  'SHIFT_LEAD'
FROM "Restaurant" r;

ALTER TABLE "StaffMember"
  ADD COLUMN "email" TEXT,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "staffRoleId" UUID;

UPDATE "StaffMember" s
SET "email" = lower(trim(s."contact"))
WHERE s."contact" ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';

UPDATE "StaffMember" s
SET "staffRoleId" = r."id"
FROM "StaffRole" r
WHERE r."restaurantId" = s."restaurantId"
  AND r."presetKey" = CASE
    WHEN s."permissionPreset"::text = 'HOST' THEN 'HOST'
    WHEN s."permissionPreset"::text = 'MANAGER' THEN 'SHIFT_LEAD'
    ELSE 'FLOOR_STAFF'
  END;

ALTER TABLE "StaffInvite"
  ADD COLUMN "createdByMembershipId" UUID,
  ADD COLUMN "recipientEmail" TEXT,
  ADD COLUMN "staffRoleId" UUID;

UPDATE "StaffInvite" i
SET "recipientEmail" = COALESCE(
      (SELECT lower(trim(s."email")) FROM "StaffMember" s WHERE s."id" = i."staffMemberId"),
      'legacy-' || i."id"::text || '@invalid.local'
    ),
    "staffRoleId" = (SELECT s."staffRoleId" FROM "StaffMember" s WHERE s."id" = i."staffMemberId"),
    "createdByMembershipId" = (
      SELECT m."id"
      FROM "RestaurantMembership" m
      WHERE m."restaurantId" = i."restaurantId"
        AND m."profileId" = i."createdById"
        AND m."active" = true
      ORDER BY m."createdAt" ASC
      LIMIT 1
    );

-- Legacy invites without a verified recipient must never become reusable.
UPDATE "StaffInvite"
SET "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP)
WHERE "recipientEmail" LIKE 'legacy-%@invalid.local';
ALTER TABLE "StaffInvite" ALTER COLUMN "recipientEmail" SET NOT NULL;

CREATE TABLE "StaffInviteAttempt" (
  "id" UUID NOT NULL,
  "inviteId" UUID,
  "profileId" UUID,
  "ipHash" TEXT NOT NULL,
  "successful" BOOLEAN NOT NULL DEFAULT false,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffInviteAttempt_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DiningTable" ADD COLUMN "syntheticBatchId" UUID;
ALTER TABLE "TableStatusEvent"
  ADD COLUMN "actorMembershipId" UUID,
  ADD COLUMN "syntheticBatchId" UUID;
ALTER TABLE "DiningSession"
  ADD COLUMN "seatingAssignmentId" UUID,
  ADD COLUMN "syntheticBatchId" UUID;
ALTER TABLE "QueueEntry"
  ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "syntheticBatchId" UUID;
ALTER TABLE "Reservation" ADD COLUMN "syntheticBatchId" UUID;

WITH ordered AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "restaurantId" ORDER BY "joinedAt", "id"
  )::integer - 1 AS next_position
  FROM "QueueEntry"
  WHERE "status" IN ('WAITING', 'CALLED')
)
UPDATE "QueueEntry" q
SET "position" = ordered.next_position
FROM ordered
WHERE q."id" = ordered."id";

DROP INDEX "TableStatusEvent_restaurantId_sourceCommandId_key";
DROP INDEX "DiningSession_queueEntryId_key";
DROP INDEX "DiningSession_reservationId_key";

CREATE TABLE "SeatingAssignment" (
  "id" UUID NOT NULL,
  "restaurantId" UUID NOT NULL,
  "queueEntryId" UUID,
  "reservationId" UUID,
  "partySize" INTEGER NOT NULL,
  "status" "SeatingAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "seatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SeatingAssignment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SeatingAssignmentTable" (
  "seatingAssignmentId" UUID NOT NULL,
  "diningTableId" UUID NOT NULL,
  "diningSessionId" UUID NOT NULL,
  CONSTRAINT "SeatingAssignmentTable_pkey" PRIMARY KEY ("seatingAssignmentId", "diningTableId")
);

-- Preserve every pre-existing session as a normalized one-table seating
-- assignment. The previous schema's unique queue/reservation source columns
-- meant an existing source could not yet have more than one linked session.
-- Reusing the session UUID gives us a deterministic, collision-free backfill.
INSERT INTO "SeatingAssignment" (
  "id", "restaurantId", "queueEntryId", "reservationId", "partySize",
  "status", "seatedAt", "completedAt", "createdAt", "updatedAt"
)
SELECT
  session."id",
  session."restaurantId",
  session."queueEntryId",
  session."reservationId",
  session."partySize",
  CASE session."status"::text
    WHEN 'ACTIVE' THEN 'ACTIVE'::"SeatingAssignmentStatus"
    WHEN 'COMPLETED' THEN 'COMPLETED'::"SeatingAssignmentStatus"
    ELSE 'CLEARING'::"SeatingAssignmentStatus"
  END,
  session."seatedAt",
  session."completedAt",
  session."createdAt",
  session."updatedAt"
FROM "DiningSession" session;

UPDATE "DiningSession"
SET "seatingAssignmentId" = "id";

INSERT INTO "SeatingAssignmentTable" (
  "seatingAssignmentId", "diningTableId", "diningSessionId"
)
SELECT "id", "diningTableId", "id"
FROM "DiningSession";

CREATE TABLE "OperationCommand" (
  "id" UUID NOT NULL,
  "restaurantId" UUID NOT NULL,
  "actorMembershipId" UUID NOT NULL,
  "commandType" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "result" JSONB NOT NULL DEFAULT '{}',
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationCommand_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SyntheticImportBatch" (
  "id" UUID NOT NULL,
  "restaurantId" UUID NOT NULL,
  "actorProfileId" UUID NOT NULL,
  "actorMembershipId" UUID,
  "originalFilename" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "status" "ImportBatchStatus" NOT NULL DEFAULT 'STAGED',
  "normalizedRows" JSONB NOT NULL,
  "validationResults" JSONB NOT NULL,
  "rowCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedAt" TIMESTAMP(3),
  "revertedAt" TIMESTAMP(3),
  CONSTRAINT "SyntheticImportBatch_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AdminAuditLog" (
  "id" UUID NOT NULL,
  "restaurantId" UUID,
  "actorProfileId" UUID NOT NULL,
  "actorMembershipId" UUID,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "details" JSONB NOT NULL DEFAULT '{}',
  "ipHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AdminAuthAttempt" (
  "id" UUID NOT NULL,
  "profileId" UUID NOT NULL,
  "ipHash" TEXT NOT NULL,
  "successful" BOOLEAN NOT NULL DEFAULT false,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminAuthAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffRole_restaurantId_name_key" ON "StaffRole"("restaurantId", "name");
CREATE INDEX "StaffRole_restaurantId_archivedAt_idx" ON "StaffRole"("restaurantId", "archivedAt");
CREATE INDEX "StaffMember_restaurantId_email_idx" ON "StaffMember"("restaurantId", "email");
CREATE INDEX "StaffMember_staffRoleId_idx" ON "StaffMember"("staffRoleId");
CREATE INDEX "StaffInvite_recipientEmail_expiresAt_idx" ON "StaffInvite"("recipientEmail", "expiresAt");
CREATE INDEX "StaffInviteAttempt_profileId_attemptedAt_idx" ON "StaffInviteAttempt"("profileId", "attemptedAt");
CREATE INDEX "StaffInviteAttempt_ipHash_attemptedAt_idx" ON "StaffInviteAttempt"("ipHash", "attemptedAt");
CREATE INDEX "SeatingAssignment_queueEntryId_seatedAt_idx" ON "SeatingAssignment"("queueEntryId", "seatedAt");
CREATE INDEX "SeatingAssignment_reservationId_seatedAt_idx" ON "SeatingAssignment"("reservationId", "seatedAt");
CREATE INDEX "SeatingAssignment_restaurantId_status_seatedAt_idx" ON "SeatingAssignment"("restaurantId", "status", "seatedAt");
CREATE UNIQUE INDEX "SeatingAssignmentTable_diningSessionId_key" ON "SeatingAssignmentTable"("diningSessionId");
CREATE INDEX "SeatingAssignmentTable_diningTableId_idx" ON "SeatingAssignmentTable"("diningTableId");
CREATE INDEX "OperationCommand_restaurantId_completedAt_idx" ON "OperationCommand"("restaurantId", "completedAt");
CREATE INDEX "OperationCommand_actorMembershipId_completedAt_idx" ON "OperationCommand"("actorMembershipId", "completedAt");
CREATE UNIQUE INDEX "SyntheticImportBatch_restaurantId_checksum_key" ON "SyntheticImportBatch"("restaurantId", "checksum");
CREATE INDEX "SyntheticImportBatch_restaurantId_createdAt_idx" ON "SyntheticImportBatch"("restaurantId", "createdAt");
CREATE INDEX "AdminAuditLog_actorProfileId_createdAt_idx" ON "AdminAuditLog"("actorProfileId", "createdAt");
CREATE INDEX "AdminAuditLog_restaurantId_createdAt_idx" ON "AdminAuditLog"("restaurantId", "createdAt");
CREATE INDEX "AdminAuthAttempt_profileId_attemptedAt_idx" ON "AdminAuthAttempt"("profileId", "attemptedAt");
CREATE INDEX "AdminAuthAttempt_ipHash_attemptedAt_idx" ON "AdminAuthAttempt"("ipHash", "attemptedAt");
CREATE INDEX "Restaurant_environment_archivedAt_idx" ON "Restaurant"("environment", "archivedAt");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "DiningTable"
    WHERE "active" = true AND "archivedAt" IS NULL
    GROUP BY "restaurantId", lower(trim("label"))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce active table-label uniqueness: resolve duplicate labels within a restaurant first.';
  END IF;
END $$;
CREATE UNIQUE INDEX "DiningTable_restaurantId_active_label_key"
  ON "DiningTable"("restaurantId", lower(trim("label")))
  WHERE "active" = true AND "archivedAt" IS NULL;

CREATE INDEX "DiningTable_syntheticBatchId_idx" ON "DiningTable"("syntheticBatchId");
CREATE INDEX "TableStatusEvent_restaurantId_sourceCommandId_idx" ON "TableStatusEvent"("restaurantId", "sourceCommandId");
CREATE INDEX "TableStatusEvent_actorMembershipId_occurredAt_idx" ON "TableStatusEvent"("actorMembershipId", "occurredAt");
CREATE INDEX "TableStatusEvent_syntheticBatchId_idx" ON "TableStatusEvent"("syntheticBatchId");
CREATE UNIQUE INDEX "TableStatusEvent_diningTableId_sourceCommandId_key" ON "TableStatusEvent"("diningTableId", "sourceCommandId");
CREATE INDEX "DiningSession_queueEntryId_idx" ON "DiningSession"("queueEntryId");
CREATE INDEX "DiningSession_reservationId_idx" ON "DiningSession"("reservationId");
CREATE INDEX "DiningSession_seatingAssignmentId_idx" ON "DiningSession"("seatingAssignmentId");
CREATE INDEX "DiningSession_syntheticBatchId_idx" ON "DiningSession"("syntheticBatchId");
CREATE INDEX "QueueEntry_restaurantId_position_idx" ON "QueueEntry"("restaurantId", "position");
CREATE INDEX "QueueEntry_syntheticBatchId_idx" ON "QueueEntry"("syntheticBatchId");
CREATE INDEX "Reservation_syntheticBatchId_idx" ON "Reservation"("syntheticBatchId");

ALTER TABLE "StaffRole" ADD CONSTRAINT "StaffRole_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_staffRoleId_fkey" FOREIGN KEY ("staffRoleId") REFERENCES "StaffRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_staffRoleId_fkey" FOREIGN KEY ("staffRoleId") REFERENCES "StaffRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "RestaurantMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffInviteAttempt" ADD CONSTRAINT "StaffInviteAttempt_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "StaffInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffInviteAttempt" ADD CONSTRAINT "StaffInviteAttempt_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SeatingAssignment" ADD CONSTRAINT "SeatingAssignment_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeatingAssignment" ADD CONSTRAINT "SeatingAssignment_queueEntryId_fkey" FOREIGN KEY ("queueEntryId") REFERENCES "QueueEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SeatingAssignment" ADD CONSTRAINT "SeatingAssignment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SeatingAssignmentTable" ADD CONSTRAINT "SeatingAssignmentTable_seatingAssignmentId_fkey" FOREIGN KEY ("seatingAssignmentId") REFERENCES "SeatingAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeatingAssignmentTable" ADD CONSTRAINT "SeatingAssignmentTable_diningTableId_fkey" FOREIGN KEY ("diningTableId") REFERENCES "DiningTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SeatingAssignmentTable" ADD CONSTRAINT "SeatingAssignmentTable_diningSessionId_fkey" FOREIGN KEY ("diningSessionId") REFERENCES "DiningSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperationCommand" ADD CONSTRAINT "OperationCommand_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationCommand" ADD CONSTRAINT "OperationCommand_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "RestaurantMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SyntheticImportBatch" ADD CONSTRAINT "SyntheticImportBatch_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SyntheticImportBatch" ADD CONSTRAINT "SyntheticImportBatch_actorProfileId_fkey" FOREIGN KEY ("actorProfileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SyntheticImportBatch" ADD CONSTRAINT "SyntheticImportBatch_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "RestaurantMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_syntheticBatchId_fkey" FOREIGN KEY ("syntheticBatchId") REFERENCES "SyntheticImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TableStatusEvent" ADD CONSTRAINT "TableStatusEvent_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "RestaurantMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TableStatusEvent" ADD CONSTRAINT "TableStatusEvent_syntheticBatchId_fkey" FOREIGN KEY ("syntheticBatchId") REFERENCES "SyntheticImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiningSession" ADD CONSTRAINT "DiningSession_seatingAssignmentId_fkey" FOREIGN KEY ("seatingAssignmentId") REFERENCES "SeatingAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiningSession" ADD CONSTRAINT "DiningSession_syntheticBatchId_fkey" FOREIGN KEY ("syntheticBatchId") REFERENCES "SyntheticImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_syntheticBatchId_fkey" FOREIGN KEY ("syntheticBatchId") REFERENCES "SyntheticImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_syntheticBatchId_fkey" FOREIGN KEY ("syntheticBatchId") REFERENCES "SyntheticImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorProfileId_fkey" FOREIGN KEY ("actorProfileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "RestaurantMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminAuthAttempt" ADD CONSTRAINT "AdminAuthAttempt_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
