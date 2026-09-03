-- Staff access is tied to a user's normal Halina account by verified email.
-- The 4-digit restaurant PIN only creates a temporary work-mode session; it
-- never creates a separate employee account or RestaurantMembership.

-- AlterEnum
ALTER TYPE "StaffAccessStatus" ADD VALUE IF NOT EXISTS 'WHITELISTED';

-- AlterTable
ALTER TABLE "Restaurant"
ADD COLUMN "staffPinHash" TEXT,
ADD COLUMN "staffPinChangedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StaffMember"
ADD COLUMN "email" TEXT,
ADD COLUMN "emailNormalized" TEXT,
ADD COLUMN "workAccessEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lastClockedInAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TableStatusEvent"
ADD COLUMN "actorStaffMemberId" UUID;

-- CreateTable
CREATE TABLE "StaffWorkSession" (
    "id" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "staffMemberId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "StaffWorkSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffPinAttempt" (
    "id" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "successful" BOOLEAN NOT NULL DEFAULT false,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffPinAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffMember_restaurantId_emailNormalized_key"
ON "StaffMember"("restaurantId", "emailNormalized");

-- CreateIndex
CREATE INDEX "StaffMember_restaurantId_workAccessEnabled_emailNormalized_idx"
ON "StaffMember"("restaurantId", "workAccessEnabled", "emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "StaffWorkSession_tokenHash_key"
ON "StaffWorkSession"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffWorkSession_profileId_endedAt_expiresAt_idx"
ON "StaffWorkSession"("profileId", "endedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "StaffWorkSession_staffMemberId_endedAt_expiresAt_idx"
ON "StaffWorkSession"("staffMemberId", "endedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "StaffWorkSession_restaurantId_endedAt_expiresAt_idx"
ON "StaffWorkSession"("restaurantId", "endedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "StaffPinAttempt_restaurantId_profileId_attemptedAt_idx"
ON "StaffPinAttempt"("restaurantId", "profileId", "attemptedAt");

-- CreateIndex
CREATE INDEX "TableStatusEvent_actorStaffMemberId_occurredAt_idx"
ON "TableStatusEvent"("actorStaffMemberId", "occurredAt");

-- AddForeignKey
ALTER TABLE "StaffWorkSession"
ADD CONSTRAINT "StaffWorkSession_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffWorkSession"
ADD CONSTRAINT "StaffWorkSession_staffMemberId_fkey"
FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffWorkSession"
ADD CONSTRAINT "StaffWorkSession_profileId_fkey"
FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPinAttempt"
ADD CONSTRAINT "StaffPinAttempt_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPinAttempt"
ADD CONSTRAINT "StaffPinAttempt_profileId_fkey"
FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableStatusEvent"
ADD CONSTRAINT "TableStatusEvent_actorStaffMemberId_fkey"
FOREIGN KEY ("actorStaffMemberId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
