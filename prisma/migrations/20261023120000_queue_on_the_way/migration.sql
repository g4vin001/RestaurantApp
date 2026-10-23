-- Called customers can tell the host they're coming. QueueEntry already has
-- RLS enabled and no Data API grants.
ALTER TABLE "QueueEntry" ADD COLUMN "onTheWayAt" TIMESTAMP(3);
