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

  const roles = await prisma.staffRole.findMany({
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
  });
  const roleOptions = roles.map((role) => ({
    id: role.id,
    name: role.name,
    presetKey: role.presetKey,
  }));

  return (
    <>
      <DatabaseTeamManager roles={roleOptions} />
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
    </>
  );
}
