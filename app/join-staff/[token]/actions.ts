"use server";

import { redirect } from "next/navigation";
import { ensureProfile } from "@/lib/auth/profile";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { hashStaffInviteSecret } from "@/lib/staff/invitations";

export async function redeemStaffInvite(token: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(`/join-staff/${token}`)}`);
  const profile = await ensureProfile(user);
  const tokenHash = hashStaffInviteSecret(token);

  const result = await prisma.$transaction(async (tx) => {
    const invite = await tx.staffInvite.findUnique({
      where: { tokenHash },
      include: { staffMember: true },
    });
    if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt <= new Date()) {
      return { ok: false as const, error: "This staff invite is invalid, expired, or already used." };
    }
    const existing = await tx.restaurantMembership.findUnique({
      where: { restaurantId_profileId: { restaurantId: invite.restaurantId, profileId: profile.id } },
    });
    if (existing && existing.role !== "STAFF") {
      return { ok: false as const, error: "This account already has owner or manager access to the restaurant." };
    }
    const membership = await tx.restaurantMembership.upsert({
      where: { restaurantId_profileId: { restaurantId: invite.restaurantId, profileId: profile.id } },
      create: { restaurantId: invite.restaurantId, profileId: profile.id, role: "STAFF", active: true },
      update: { role: "STAFF", active: true },
    });
    await tx.staffMember.update({
      where: { id: invite.staffMemberId },
      data: { membershipId: membership.id, accessStatus: "ACTIVE", active: true },
    });
    await tx.staffInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date(), redeemedById: profile.id },
    });
    return { ok: true as const };
  });

  if (!result.ok) redirect(`/join-staff/${token}?error=${encodeURIComponent(result.error)}`);
  redirect("/ops");
}
