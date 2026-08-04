-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'MANAGER');

-- CreateEnum
CREATE TYPE "StaffPermissionPreset" AS ENUM ('MANAGER', 'HOST', 'FLOOR_STAFF');

-- CreateEnum
CREATE TYPE "StaffAccessStatus" AS ENUM ('NOT_INVITED', 'ACCESS_DISABLED');

-- CreateEnum
CREATE TYPE "WalkInAvailability" AS ENUM ('AVAILABLE', 'LIMITED', 'PAUSED');

-- CreateEnum
CREATE TYPE "FloorPlanVersionStatus" AS ENUM ('PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FloorElementType" AS ENUM ('TABLE', 'BAR', 'WALL', 'DOOR', 'HOST_STAND', 'WAITING_AREA', 'KITCHEN', 'RESTROOM', 'COLUMN', 'TEXT', 'ZONE');

-- CreateEnum
CREATE TYPE "TableShape" AS ENUM ('ROUND', 'SQUARE', 'RECTANGLE', 'BOOTH');

-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'HELD', 'RESERVED', 'OCCUPIED', 'CLEANING', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "DiningSessionStatus" AS ENUM ('ACTIVE', 'CLEARED', 'CLEANING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('WAITING', 'CALLED', 'SEATED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('CONFIRMED', 'ARRIVED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Restaurant" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Manila',
    "locale" TEXT NOT NULL DEFAULT 'en-PH',
    "operatingSettings" JSONB NOT NULL DEFAULT '{}',
    "walkInAvailability" "WalkInAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "lastOperationalUpdateAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantMembership" (
    "id" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMember" (
    "id" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "membershipId" UUID,
    "name" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "contact" TEXT,
    "permissionPreset" "StaffPermissionPreset" NOT NULL,
    "accessStatus" "StaffAccessStatus" NOT NULL DEFAULT 'NOT_INVITED',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorPlan" (
    "id" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "logicalWidth" INTEGER NOT NULL DEFAULT 1600,
    "logicalHeight" INTEGER NOT NULL DEFAULT 1000,
    "draftRevision" INTEGER NOT NULL DEFAULT 0,
    "draftSnapshot" JSONB NOT NULL DEFAULT '{}',
    "activeVersionId" UUID,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorPlanVersion" (
    "id" UUID NOT NULL,
    "floorPlanId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "logicalWidth" INTEGER NOT NULL,
    "logicalHeight" INTEGER NOT NULL,
    "status" "FloorPlanVersionStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdById" UUID,
    "publishedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "FloorPlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorElement" (
    "id" UUID NOT NULL,
    "floorPlanVersionId" UUID NOT NULL,
    "stableElementId" UUID NOT NULL,
    "diningTableId" UUID,
    "type" "FloorElementType" NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "zIndex" INTEGER NOT NULL DEFAULT 0,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT NOT NULL DEFAULT '',
    "zone" TEXT,
    "shape" "TableShape",
    "properties" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "FloorElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiningTable" (
    "id" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "minPartySize" INTEGER NOT NULL DEFAULT 1,
    "maxPartySize" INTEGER NOT NULL,
    "zone" TEXT NOT NULL DEFAULT 'Main',
    "shape" "TableShape" NOT NULL,
    "currentStatus" "TableStatus" NOT NULL DEFAULT 'AVAILABLE',
    "statusRevision" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiningTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableStatusEvent" (
    "id" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "diningTableId" UUID NOT NULL,
    "fromStatus" "TableStatus" NOT NULL,
    "toStatus" "TableStatus" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorProfileId" UUID,
    "sourceCommandId" UUID NOT NULL,
    "reason" TEXT,

    CONSTRAINT "TableStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiningSession" (
    "id" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "diningTableId" UUID NOT NULL,
    "queueEntryId" UUID,
    "reservationId" UUID,
    "partySize" INTEGER NOT NULL,
    "status" "DiningSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "seatedAt" TIMESTAMP(3) NOT NULL,
    "clearedAt" TIMESTAMP(3),
    "cleaningStartedAt" TIMESTAMP(3),
    "availableAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiningSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueEntry" (
    "id" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "partyName" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL,
    "contact" TEXT,
    "notes" TEXT,
    "preferredZone" TEXT,
    "status" "QueueStatus" NOT NULL DEFAULT 'WAITING',
    "promisedWaitMinutes" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calledAt" TIMESTAMP(3),
    "seatedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "noShowAt" TIMESTAMP(3),
    "assignedTableId" UUID,
    "createdById" UUID,
    "source" TEXT NOT NULL DEFAULT 'MANAGER',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "partyName" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL,
    "contact" TEXT,
    "notes" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "assignedTableId" UUID,
    "createdById" UUID,
    "arrivedAt" TIMESTAMP(3),
    "seatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "noShowAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_slug_key" ON "Restaurant"("slug");

-- CreateIndex
CREATE INDEX "RestaurantMembership_profileId_active_idx" ON "RestaurantMembership"("profileId", "active");

-- CreateIndex
CREATE INDEX "RestaurantMembership_restaurantId_active_idx" ON "RestaurantMembership"("restaurantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantMembership_restaurantId_profileId_key" ON "RestaurantMembership"("restaurantId", "profileId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffMember_membershipId_key" ON "StaffMember"("membershipId");

-- CreateIndex
CREATE INDEX "StaffMember_restaurantId_active_idx" ON "StaffMember"("restaurantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "FloorPlan_activeVersionId_key" ON "FloorPlan"("activeVersionId");

-- CreateIndex
CREATE INDEX "FloorPlan_restaurantId_archivedAt_idx" ON "FloorPlan"("restaurantId", "archivedAt");

-- CreateIndex
CREATE INDEX "FloorPlanVersion_floorPlanId_publishedAt_idx" ON "FloorPlanVersion"("floorPlanId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FloorPlanVersion_floorPlanId_version_key" ON "FloorPlanVersion"("floorPlanId", "version");

-- CreateIndex
CREATE INDEX "FloorElement_diningTableId_idx" ON "FloorElement"("diningTableId");

-- CreateIndex
CREATE INDEX "FloorElement_floorPlanVersionId_zIndex_idx" ON "FloorElement"("floorPlanVersionId", "zIndex");

-- CreateIndex
CREATE UNIQUE INDEX "FloorElement_floorPlanVersionId_stableElementId_key" ON "FloorElement"("floorPlanVersionId", "stableElementId");

-- CreateIndex
CREATE INDEX "DiningTable_restaurantId_active_idx" ON "DiningTable"("restaurantId", "active");

-- CreateIndex
CREATE INDEX "DiningTable_restaurantId_currentStatus_idx" ON "DiningTable"("restaurantId", "currentStatus");

-- CreateIndex
CREATE INDEX "DiningTable_restaurantId_label_idx" ON "DiningTable"("restaurantId", "label");

-- CreateIndex
CREATE INDEX "TableStatusEvent_restaurantId_occurredAt_idx" ON "TableStatusEvent"("restaurantId", "occurredAt");

-- CreateIndex
CREATE INDEX "TableStatusEvent_diningTableId_occurredAt_idx" ON "TableStatusEvent"("diningTableId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "TableStatusEvent_restaurantId_sourceCommandId_key" ON "TableStatusEvent"("restaurantId", "sourceCommandId");

-- CreateIndex
CREATE UNIQUE INDEX "DiningSession_queueEntryId_key" ON "DiningSession"("queueEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "DiningSession_reservationId_key" ON "DiningSession"("reservationId");

-- CreateIndex
CREATE INDEX "DiningSession_restaurantId_seatedAt_idx" ON "DiningSession"("restaurantId", "seatedAt");

-- CreateIndex
CREATE INDEX "DiningSession_diningTableId_seatedAt_idx" ON "DiningSession"("diningTableId", "seatedAt");

-- CreateIndex
CREATE INDEX "DiningSession_restaurantId_status_idx" ON "DiningSession"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "QueueEntry_restaurantId_status_joinedAt_idx" ON "QueueEntry"("restaurantId", "status", "joinedAt");

-- CreateIndex
CREATE INDEX "QueueEntry_restaurantId_assignedTableId_idx" ON "QueueEntry"("restaurantId", "assignedTableId");

-- CreateIndex
CREATE INDEX "Reservation_restaurantId_status_scheduledAt_idx" ON "Reservation"("restaurantId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Reservation_restaurantId_assignedTableId_scheduledAt_idx" ON "Reservation"("restaurantId", "assignedTableId", "scheduledAt");

-- AddForeignKey
ALTER TABLE "RestaurantMembership" ADD CONSTRAINT "RestaurantMembership_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantMembership" ADD CONSTRAINT "RestaurantMembership_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "RestaurantMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorPlan" ADD CONSTRAINT "FloorPlan_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorPlan" ADD CONSTRAINT "FloorPlan_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "FloorPlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorPlanVersion" ADD CONSTRAINT "FloorPlanVersion_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "FloorPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorPlanVersion" ADD CONSTRAINT "FloorPlanVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorPlanVersion" ADD CONSTRAINT "FloorPlanVersion_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorElement" ADD CONSTRAINT "FloorElement_floorPlanVersionId_fkey" FOREIGN KEY ("floorPlanVersionId") REFERENCES "FloorPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorElement" ADD CONSTRAINT "FloorElement_diningTableId_fkey" FOREIGN KEY ("diningTableId") REFERENCES "DiningTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableStatusEvent" ADD CONSTRAINT "TableStatusEvent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableStatusEvent" ADD CONSTRAINT "TableStatusEvent_diningTableId_fkey" FOREIGN KEY ("diningTableId") REFERENCES "DiningTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableStatusEvent" ADD CONSTRAINT "TableStatusEvent_actorProfileId_fkey" FOREIGN KEY ("actorProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningSession" ADD CONSTRAINT "DiningSession_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningSession" ADD CONSTRAINT "DiningSession_diningTableId_fkey" FOREIGN KEY ("diningTableId") REFERENCES "DiningTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningSession" ADD CONSTRAINT "DiningSession_queueEntryId_fkey" FOREIGN KEY ("queueEntryId") REFERENCES "QueueEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningSession" ADD CONSTRAINT "DiningSession_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_assignedTableId_fkey" FOREIGN KEY ("assignedTableId") REFERENCES "DiningTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_assignedTableId_fkey" FOREIGN KEY ("assignedTableId") REFERENCES "DiningTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain constraints Prisma cannot express directly.
ALTER TABLE "FloorPlan"
  ADD CONSTRAINT "FloorPlan_logical_size_check"
  CHECK ("logicalWidth" > 0 AND "logicalHeight" > 0);

ALTER TABLE "FloorElement"
  ADD CONSTRAINT "FloorElement_size_check"
  CHECK ("width" > 0 AND "height" > 0);

ALTER TABLE "DiningTable"
  ADD CONSTRAINT "DiningTable_capacity_check"
  CHECK (
    "capacity" > 0
    AND "minPartySize" > 0
    AND "maxPartySize" >= "minPartySize"
  );

ALTER TABLE "QueueEntry"
  ADD CONSTRAINT "QueueEntry_party_and_wait_check"
  CHECK ("partySize" > 0 AND "promisedWaitMinutes" >= 0);

ALTER TABLE "Reservation"
  ADD CONSTRAINT "Reservation_party_size_check"
  CHECK ("partySize" > 0);

-- Active labels are unique while archived table identities remain reusable.
CREATE UNIQUE INDEX "DiningTable_active_restaurant_label_key"
ON "DiningTable" ("restaurantId", lower("label"))
WHERE "active" = true AND "archivedAt" IS NULL;

-- Preserve existing manager accounts without trusting a client-supplied tenant.
-- Each distinct legacy restaurant name becomes one restaurant, and legacy
-- MANAGER profiles become its initial OWNER. EMPLOYEE profiles are not granted
-- manager access. The old Profile fields remain temporarily for rollback and
-- must not be used by new authorization code.
WITH "LegacyRestaurants" AS (
  SELECT DISTINCT btrim("restaurant") AS "name"
  FROM "Profile"
  WHERE
    "role" = 'MANAGER'::"Role"
    AND NULLIF(btrim("restaurant"), '') IS NOT NULL
)
INSERT INTO "Restaurant" (
  "id",
  "slug",
  "name",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  (
    CASE
      WHEN btrim(regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'), '-') = ''
        THEN 'restaurant'
      ELSE btrim(regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'), '-')
    END
    || '-'
    || substr(md5("name"), 1, 8)
  ),
  "name",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "LegacyRestaurants"
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "RestaurantMembership" (
  "id",
  "restaurantId",
  "profileId",
  "role",
  "active",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  "Restaurant"."id",
  "Profile"."id",
  'OWNER'::"MembershipRole",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Profile"
JOIN "Restaurant"
  ON "Restaurant"."slug" = (
    CASE
      WHEN btrim(regexp_replace(lower(btrim("Profile"."restaurant")), '[^a-z0-9]+', '-', 'g'), '-') = ''
        THEN 'restaurant'
      ELSE btrim(regexp_replace(lower(btrim("Profile"."restaurant")), '[^a-z0-9]+', '-', 'g'), '-')
    END
    || '-'
    || substr(md5(btrim("Profile"."restaurant")), 1, 8)
  )
WHERE
  "Profile"."role" = 'MANAGER'::"Role"
  AND NULLIF(btrim("Profile"."restaurant"), '') IS NOT NULL
ON CONFLICT ("restaurantId", "profileId") DO NOTHING;

INSERT INTO "FloorPlan" (
  "id",
  "restaurantId",
  "name",
  "logicalWidth",
  "logicalHeight",
  "draftRevision",
  "draftSnapshot",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  "Restaurant"."id",
  'Main floor',
  1600,
  1000,
  0,
  '{"elements":[],"logicalWidth":1600,"logicalHeight":1000}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Restaurant"
WHERE NOT EXISTS (
  SELECT 1
  FROM "FloorPlan"
  WHERE "FloorPlan"."restaurantId" = "Restaurant"."id"
);

-- Prisma supplies updatedAt on future writes; the temporary migration default
-- exists only to make the existing Profile rows safe to backfill.
ALTER TABLE "Profile" ALTER COLUMN "updatedAt" DROP DEFAULT;
