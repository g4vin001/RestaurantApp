-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN "customerProfileId" UUID;

-- CreateIndex
CREATE INDEX "Reservation_customerProfileId_idx" ON "Reservation"("customerProfileId");

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
