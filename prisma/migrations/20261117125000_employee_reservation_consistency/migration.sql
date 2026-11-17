-- CreateEnum
CREATE TYPE "RestaurantApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- AlterTable
ALTER TABLE "QueueEntry" ADD COLUMN     "customerSeatingNote" TEXT;

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "customerNote" TEXT;

-- CreateTable
CREATE TABLE "RestaurantApplication" (
    "applicantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "mapsUrl" TEXT NOT NULL,
    "status" "RestaurantApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" UUID,
    "restaurantId" UUID,

    CONSTRAINT "RestaurantApplication_pkey" PRIMARY KEY ("applicantId")
);

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantApplication_restaurantId_key" ON "RestaurantApplication"("restaurantId");

-- CreateIndex
CREATE INDEX "RestaurantApplication_status_submittedAt_idx" ON "RestaurantApplication"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "RestaurantApplication_reviewedById_idx" ON "RestaurantApplication"("reviewedById");

-- AddForeignKey
ALTER TABLE "RestaurantApplication" ADD CONSTRAINT "RestaurantApplication_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantApplication" ADD CONSTRAINT "RestaurantApplication_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantApplication" ADD CONSTRAINT "RestaurantApplication_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The application contains applicant information and is only read by server code.
ALTER TABLE "RestaurantApplication" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "RestaurantApplication" FROM anon, authenticated;

-- Older floor clears could finish all the dining sessions while leaving their
-- booking marked seated. Repair only the latest group with a recorded clear.
WITH most_recent_group AS (
    SELECT DISTINCT ON ("reservationId") "id", "reservationId", "status", "seatedAt"
    FROM "SeatingAssignment"
    WHERE "reservationId" IS NOT NULL
    ORDER BY "reservationId", "seatedAt" DESC, "createdAt" DESC, "id" DESC
),
cleared_booking AS (
    SELECT g."reservationId", g."seatedAt", MAX(s."clearedAt") AS cleared_at
    FROM most_recent_group g
    JOIN "DiningSession" s ON s."seatingAssignmentId" = g."id"
    WHERE g."status" IN ('CLEARING', 'COMPLETED')
    GROUP BY g."reservationId", g."seatedAt"
    HAVING BOOL_AND(
        s."clearedAt" IS NOT NULL AND s."clearedAt" >= g."seatedAt"
        AND s."status" IN ('CLEANING', 'CLEARED', 'COMPLETED')
    )
)
UPDATE "Reservation" r
SET "status" = 'COMPLETED', "completedAt" = c.cleared_at,
    "revision" = r."revision" + 1, "updatedAt" = CURRENT_TIMESTAMP
FROM cleared_booking c
WHERE c."reservationId" = r."id" AND c."seatedAt" >= r."seatedAt"
  AND r."status" = 'SEATED';
