import { redirect } from "next/navigation";
import { TeamManager } from "@/components/manager/TeamManager";
import { DatabaseTeamManager } from "@/components/manager/DatabaseTeamManager";
import { getActiveManagerMembership } from "@/lib/auth/manager-membership";
import { prisma } from "@/lib/prisma";
import { resolveOperationsRepositoryMode } from "@/lib/repositories/operations";
import { createClient } from "@/lib/supabase/server";
import { StaffRoleManager } from "./StaffRoleManager";

const demoRoles = [
  { id: "demo-floor-staff", name: "Floor Staff", presetKey: "FLOOR_STAFF" },
  { id: "demo-host", name: "Host", presetKey: "HOST" },
  { id: "demo-shift-lead", name: "Shift Lead", presetKey: "SHIFT_LEAD" },
];

export const dynamic = "force-dynamic";

async function staffClockInSchemaReady() {
  try {
    const rows = await prisma.$queryRaw<Array<{ ready: boolean }>>`
      SELECT (
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'StaffMember'
            AND column_name = 'workAccessEnabled'
        )
        AND to_regclass('public."StaffWorkSession"') IS NOT NULL
        AND to_regclass('public."StaffPinAttempt"') IS NOT NULL
      ) AS ready
    `;
    return rows[0]?.ready === true;
  } catch (error) {
    console.error("[halina:staff-clock-in-schema-check]", error);
    return false;
  }
}

export default async function TeamPage() {
  if (
    resolveOperationsRepositoryMode(
      process.env.NEXT_PUBLIC_HALINA_DEMO_MODE,
    ) === "demo"
  ) {
    return (
      <>
        <div className="mx-auto max-w-[1400px] px-4 pt-6 sm:px-6 lg:px-8">
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Demo mode keeps staff directory changes in this browser. Personal-account whitelist and PIN clock-in are available only in authenticated database mode.
          </p>
        </div>
        <TeamManager roles={demoRoles} />
      </>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/manager/team");
  const membership = await getActiveManagerMembership(user.id);
  if (!membership) redirect("/manager");

  const [roles, clockInReady] = await Promise.all([
    prisma.staffRole.findMany({
      where: {
        restaurantId: membership.restaurantId,
        archivedAt: null,
      },
      orderBy: [{ presetKey: "asc" }, { name: "asc" }],
      include: {
        _count: {
          select: { staffMembers: { where: { archivedAt: null } } },
        },
      },
    }),
    staffClockInSchemaReady(),
  ]);
  const roleOptions = roles.map((role) => ({
    id: role.id,
    name: role.name,
    presetKey: role.presetKey,
  }));
  const roleManager = (
    <StaffRoleManager
      roles={roles.map((role) => ({
        id: role.id,
        name: role.name,
        presetKey: role.presetKey,
        permissions: role.permissions,
        revision: role.revision,
        staffCount: role._count.staffMembers,
      }))}
    />
  );

  if (!clockInReady) {
    return (
      <>
        <div className="mx-auto max-w-[1400px] px-4 pt-6 sm:px-6 lg:px-8">
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
            Staff whitelist and PIN clock-in are prepared in the application, but the additive staff-work database migration has not been applied to this environment yet. Existing staff records remain intact.
          </p>
        </div>
        <TeamManager roles={roleOptions} />
        {roleManager}
      </>
    );
  }

  return (
    <>
      <DatabaseTeamManager roles={roleOptions} />
      {roleManager}
    </>
  );
}
