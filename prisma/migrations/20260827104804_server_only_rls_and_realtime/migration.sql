-- Prisma is the only operational data boundary. Browser Data API roles must
-- not read or mutate application tables, even if project-wide defaults drift.
DO $$
DECLARE
  table_name text;
  app_tables text[] := ARRAY[
    '_prisma_migrations', 'Profile', 'Restaurant', 'RestaurantMembership',
    'StaffMember', 'StaffRole', 'StaffInvite', 'StaffInviteAttempt',
    'FloorPlan', 'FloorPlanVersion', 'FloorElement', 'DiningTable',
    'TableStatusEvent', 'DiningSession', 'QueueEntry', 'Reservation',
    'SeatingAssignment', 'SeatingAssignmentTable', 'OperationCommand',
    'SyntheticImportBatch', 'AdminAuditLog', 'AdminAuthAttempt'
  ];
BEGIN
  FOREACH table_name IN ARRAY app_tables LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated', table_name);
    END IF;
  END LOOP;
END $$;

REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, PUBLIC;

-- Supabase permits policies on realtime.messages even though the rest of the
-- realtime schema is locked. The lookup function is private, checks auth.uid,
-- and is not exposed through the Data API.
CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION private.can_receive_halina_topic(requested_topic text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT requested_topic ~ '^restaurant:[0-9a-fA-F-]{36}$'
    AND EXISTS (
      SELECT 1
      FROM public."RestaurantMembership" membership
      WHERE membership."profileId" = (SELECT auth.uid())
        AND membership."active" = true
        AND membership."restaurantId"::text = split_part(requested_topic, ':', 2)
    );
$$;
REVOKE ALL ON FUNCTION private.can_receive_halina_topic(text) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_receive_halina_topic(text) TO authenticated;

DROP POLICY IF EXISTS "halina members receive private invalidations" ON realtime.messages;
CREATE POLICY "halina members receive private invalidations"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.messages.extension = 'broadcast'
  AND private.can_receive_halina_topic((SELECT realtime.topic()))
);
