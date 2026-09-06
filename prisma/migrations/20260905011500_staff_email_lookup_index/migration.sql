-- The global navbar and /work lookup staff access by the authenticated email
-- before a restaurant is known. The previous restaurant-first indexes could
-- not serve that query and forced a scan as the staff directory grew.
CREATE INDEX IF NOT EXISTS "StaffMember_emailNormalized_workAccessEnabled_active_archivedAt_idx"
ON "StaffMember"("emailNormalized", "workAccessEnabled", "active", "archivedAt");
