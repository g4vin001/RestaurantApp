"use server";

import { getActiveManagerMembership } from "@/lib/auth/manager-membership";
import { ensureProfile } from "@/lib/auth/profile";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { createStaffInviteSecrets } from "@/lib/staff/invitations";

export type InviteStaffState = {
  error?: string;
  inviteUrl?: string;
  shortCode?: string;
  staffName?: string;
};

export async function createStaffInvite(
  _previousState: InviteStaffState,
  formData: FormData,
): Promise<InviteStaffState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in as a manager first." };

  const profile = await ensureProfile(user);
  const membership = await getActiveManagerMembership(profile.id);
  if (!membership) return { error: "You do not have manager access to a restaurant." };

  const name = String(formData.get("name") ?? "").trim();
  const jobTitle = String(formData.get("jobTitle") ?? "").trim();
  const permissionPreset = String(formData.get("permissionPreset") ?? "FLOOR_STAFF");
  if (name.length < 2 || name.length > 80) return { error: "Enter a staff name between 2 and 80 characters." };
  if (jobTitle.length < 2 || jobTitle.length > 80) return { error: "Enter a job title between 2 and 80 characters." };
  if (!["HOST", "FLOOR_STAFF"].includes(permissionPreset)) {
    return { error: "Primitive staff access is limited to Host or Floor staff." };
  }

  const secrets = createStaffInviteSecrets();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.$transaction(async (tx) => {
    const staff = await tx.staffMember.create({
      data: {
        restaurantId: membership.restaurantId,
        name,
        jobTitle,
        permissionPreset: permissionPreset as "HOST" | "FLOOR_STAFF",
        accessStatus: "INVITED",
      },
    });
    await tx.staffInvite.create({
      data: {
        restaurantId: membership.restaurantId,
        staffMemberId: staff.id,
        tokenHash: secrets.tokenHash,
        shortCodeHash: secrets.shortCodeHash,
        expiresAt,
        createdById: profile.id,
      },
    });
  });

  return {
    staffName: name,
    shortCode: secrets.shortCode,
    inviteUrl: `/join-staff/${secrets.token}`,
  };
}
