-- Primitive staff access foundation. Review on a disposable database before applying to shared Supabase.
ALTER TYPE "MembershipRole" ADD VALUE IF NOT EXISTS 'STAFF';
ALTER TYPE "StaffAccessStatus" ADD VALUE IF NOT EXISTS 'INVITED';
ALTER TYPE "StaffAccessStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';

CREATE TABLE "StaffInvite" (
    "id" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "staffMemberId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "shortCodeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "redeemedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffInvite_tokenHash_key" ON "StaffInvite"("tokenHash");
CREATE UNIQUE INDEX "StaffInvite_shortCodeHash_key" ON "StaffInvite"("shortCodeHash");
CREATE INDEX "StaffInvite_restaurantId_expiresAt_idx" ON "StaffInvite"("restaurantId", "expiresAt");
CREATE INDEX "StaffInvite_staffMemberId_acceptedAt_revokedAt_idx" ON "StaffInvite"("staffMemberId", "acceptedAt", "revokedAt");
CREATE INDEX "QueueEntry_createdById_source_status_idx" ON "QueueEntry"("createdById", "source", "status");

ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_staffMemberId_fkey"
FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_redeemedById_fkey"
FOREIGN KEY ("redeemedById") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
