import Link from "next/link";
import { PageCard } from "@/components/PageCard";
import { InviteStaffForm } from "./InviteStaffForm";
import { redirect } from "next/navigation";
import { getActiveManagerMembership } from "@/lib/auth/manager-membership";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { resolveOperationsRepositoryMode } from "@/lib/repositories/operations";

export default async function InviteStaffPage() {
  if (
    resolveOperationsRepositoryMode(
      process.env.NEXT_PUBLIC_HALINA_DEMO_MODE,
    ) === "demo"
  ) {
    return (
      <main className="mx-auto max-w-lg px-5 py-10">
        <Link href="/manager/team" className="text-sm font-semibold text-emerald-700">← Team</Link>
        <PageCard className="mt-6">
          <h1 className="text-2xl font-bold text-stone-950">Invitations need database mode</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Demo staff records stay in this browser. Switch to authenticated
            database mode to create an email-bound, single-use staff invite.
          </p>
        </PageCard>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/manager/team/invite");
  const membership = await getActiveManagerMembership(user.id);
  if (!membership) redirect("/manager");
  const [roles, staff] = await Promise.all([
    prisma.staffRole.findMany({
      where: { restaurantId: membership.restaurantId, archivedAt: null },
      orderBy: [{ presetKey: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.staffMember.findMany({
      where: {
        restaurantId: membership.restaurantId,
        archivedAt: null,
        membershipId: null,
        accessStatus: { in: ["NOT_INVITED", "ACCESS_DISABLED"] },
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        jobTitle: true,
        email: true,
        staffRoleId: true,
      },
    }),
  ]);
  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <Link href="/manager/team" className="text-sm font-semibold text-emerald-700">← Team</Link>
      <h1 className="mt-3 text-3xl font-bold text-stone-950">Invite staff</h1>
      <p className="mt-2 text-sm leading-6 text-stone-600">Create a temporary access code for a host or floor staff member. They sign in with a normal Halina account, redeem the invite, then receive restricted operations access.</p>
      <PageCard className="mt-6"><InviteStaffForm roles={roles} staff={staff} /></PageCard>
    </main>
  );
}
