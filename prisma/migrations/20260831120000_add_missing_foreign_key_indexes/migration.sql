-- Add indexes for foreign keys that are used by relation joins and referential checks.
-- This migration is additive and does not change or remove application data.
CREATE INDEX "StaffInvite_staffRoleId_idx" ON "StaffInvite"("staffRoleId");
CREATE INDEX "StaffInvite_createdById_idx" ON "StaffInvite"("createdById");
CREATE INDEX "StaffInvite_createdByMembershipId_idx" ON "StaffInvite"("createdByMembershipId");
CREATE INDEX "StaffInvite_redeemedById_idx" ON "StaffInvite"("redeemedById");
CREATE INDEX "StaffInviteAttempt_inviteId_idx" ON "StaffInviteAttempt"("inviteId");
CREATE INDEX "FloorPlanVersion_createdById_idx" ON "FloorPlanVersion"("createdById");
CREATE INDEX "FloorPlanVersion_publishedById_idx" ON "FloorPlanVersion"("publishedById");
CREATE INDEX "TableStatusEvent_actorProfileId_idx" ON "TableStatusEvent"("actorProfileId");
CREATE INDEX "QueueEntry_assignedTableId_idx" ON "QueueEntry"("assignedTableId");
CREATE INDEX "Reservation_assignedTableId_idx" ON "Reservation"("assignedTableId");
CREATE INDEX "Reservation_createdById_idx" ON "Reservation"("createdById");
CREATE INDEX "SyntheticImportBatch_actorProfileId_idx" ON "SyntheticImportBatch"("actorProfileId");
CREATE INDEX "SyntheticImportBatch_actorMembershipId_idx" ON "SyntheticImportBatch"("actorMembershipId");
CREATE INDEX "AdminAuditLog_actorMembershipId_idx" ON "AdminAuditLog"("actorMembershipId");
