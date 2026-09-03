-- Staff access is tied to a user's normal Halina account by verified email.
-- The 4-digit restaurant PIN creates a temporary work-mode session; it never
-- creates a second authentication account. An internal STAFF membership may be
-- linked after successful clock-in so existing tenant/audit command paths keep
-- a stable restaurant actor without becoming the login credential.

-- AlterEnum
ALTER TYPE "StaffAccessStatus" ADD VALUE IF NOT EXISTS 'WHITELISTED';

-- AlterTable
ALTER TABLE "Restaurant"
ADD COLUMN IF NOT EXISTS "staffPinHash" TEXT,
ADD COLUMN IF NOT EXISTS "staffPinChangedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StaffMember"
ADD COLUMN IF NOT EXISTS "emailNormalized" TEXT,
ADD COLUMN IF NOT EXISTS "workAccessEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "lastClockedInAt" TIMESTAMP(3);

-- Backfill accepted staff where possible. If legacy duplicate emails exist in
-- one restaurant, only the oldest record receives the normalized whitelist key
-- so this migration cannot fail on the new unique constraint.
WITH ranked AS (
  SELECT
    "id",
    lower(trim("email")) AS normalized_email,
    row_number() OVER (
      PARTITION BY "restaurantId", lower(trim("email"))
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "StaffMember"
  WHERE "email" IS NOT NULL
    AND trim("email") <> ''
    AND "archivedAt" IS NULL
)
UPDATE "StaffMember" AS staff
SET
  "emailNormalized" = ranked.normalized_email,
  "workAccessEnabled" = CASE
    WHEN staff."accessStatus"::text = 'ACTIVE' THEN true
    ELSE staff."workAccessEnabled"
  END
FROM ranked
WHERE staff."id" = ranked."id"
  AND ranked.rn = 1;

-- CreateTable
CREATE TABLE IF NOT EXISTS "StaffWorkSession" (
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
CREATE TABLE IF NOT EXISTS "StaffPinAttempt" (
    "id" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "successful" BOOLEAN NOT NULL DEFAULT false,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffPinAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StaffMember_restaurantId_emailNormalized_key"
ON "StaffMember"("restaurantId", "emailNormalized");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StaffMember_restaurantId_workAccessEnabled_emailNormalized_idx"
ON "StaffMember"("restaurantId", "workAccessEnabled", "emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StaffWorkSession_tokenHash_key"
ON "StaffWorkSession"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StaffWorkSession_profileId_endedAt_expiresAt_idx"
ON "StaffWorkSession"("profileId", "endedAt", "expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StaffWorkSession_staffMemberId_endedAt_expiresAt_idx"
ON "StaffWorkSession"("staffMemberId", "endedAt", "expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StaffWorkSession_restaurantId_endedAt_expiresAt_idx"
ON "StaffWorkSession"("restaurantId", "endedAt", "expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StaffPinAttempt_restaurantId_profileId_attemptedAt_idx"
ON "StaffPinAttempt"("restaurantId", "profileId", "attemptedAt");

-- AddForeignKey only when absent so a partially prepared development database
-- can safely apply the migration once.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffWorkSession_restaurantId_fkey') THEN
    ALTER TABLE "StaffWorkSession"
      ADD CONSTRAINT "StaffWorkSession_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffWorkSession_staffMemberId_fkey') THEN
    ALTER TABLE "StaffWorkSession"
      ADD CONSTRAINT "StaffWorkSession_staffMemberId_fkey"
      FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffWorkSession_profileId_fkey') THEN
    ALTER TABLE "StaffWorkSession"
      ADD CONSTRAINT "StaffWorkSession_profileId_fkey"
      FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffPinAttempt_restaurantId_fkey') THEN
    ALTER TABLE "StaffPinAttempt"
      ADD CONSTRAINT "StaffPinAttempt_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffPinAttempt_profileId_fkey') THEN
    ALTER TABLE "StaffPinAttempt"
      ADD CONSTRAINT "StaffPinAttempt_profileId_fkey"
      FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
