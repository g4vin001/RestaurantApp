import Link from "next/link";
import { TeamManager } from "@/components/manager/TeamManager";
import { redirect } from "next/navigation";
import { getActiveManagerMembership } from "@/lib/auth/manager-membership";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { readFlash } from "@/lib/flash";
import { InviteStatusList } from "./InviteStatusList";
import { StaffRoleManager } from "./StaffRoleManager";
import { resolveOperationsRepositoryMode } from "@/lib/repositories/operations";

const demoRoles = [
  { id: "demo-floor-staff", name: "Floor Staff", presetKey: "FLOOR_STAFF" },
  { id: "demo-host", name: "Host", presetKey: "HOST" },
  { id: "demo-shift-lead", name: "Shift Lead", presetKey: "SHIFT_LEAD" },
];

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
            Demo mode keeps staff directory changes in this browser. Account
            invitations and custom database roles are available only in
            authenticated database mode.
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
  const [error, message, roles, invites] = await Promise.all([
    readFlash("error"),
    readFlash("message"),
    prisma.staffRole.findMany({ where: { restaurantId: membership.restaurantId, archivedAt: null }, orderBy: [{ presetKey: "asc" }, { name: "asc" }], include: { _count: { select: { staffMembers: { where: { archivedAt: null } } } } } }),
    prisma.staffInvite.findMany({ where: { restaurantId: membership.restaurantId }, orderBy: { createdAt: "desc" }, take: 20, include: { staffMember: true, staffRole: true } }),
  ]);
  return (
    <>
      <div className="mx-auto max-w-[1400px] px-4 pt-6 sm:px-6 lg:px-8">
        {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {message && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
        <Link
          href="/manager/team/invite"
          className="inline-flex min-h-10 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
        >
          Invite staff access
        </Link>
      </div>
      <TeamManager roles={roles.map((role) => ({ id: role.id, name: role.name, presetKey: role.presetKey }))} />
      <StaffRoleManager roles={roles.map((role) => ({ id: role.id, name: role.name, presetKey: role.presetKey, permissions: role.permissions, revision: role.revision, staffCount: role._count.staffMembers }))} />
      <InviteStatusList invites={invites.map((invite) => ({ id: invite.id, name: invite.staffMember.name, email: invite.recipientEmail, roleName: invite.staffRole?.name ?? "Staff", status: invite.acceptedAt ? "ACCEPTED" : invite.revokedAt ? "REVOKED" : invite.expiresAt <= new Date() ? "EXPIRED" : "ACTIVE", expiresAt: invite.expiresAt.toISOString() }))} />
    </>
  );
}
