-- Customers see why a booking was cancelled when the restaurant stops taking
-- online reservations or blocks a date. Reservation already has RLS enabled.
ALTER TABLE "Reservation" ADD COLUMN "cancellationReason" TEXT;
