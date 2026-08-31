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
  const recipientEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  const staffRoleId = String(formData.get("staffRoleId") ?? "");
  const requestedStaffMemberId = String(formData.get("staffMemberId") ?? "");
  if (name.length < 2 || name.length > 80) return { error: "Enter a staff name between 2 and 80 characters." };
  if (jobTitle.length < 2 || jobTitle.length > 80) return { error: "Enter a job title between 2 and 80 characters." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return { error: "Enter the verified email address the staff member will use for Halina." };
  }

  const secrets = createStaffInviteSecrets();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  try {
    await prisma.$transaction(async (tx) => {
      const staffRole = await tx.staffRole.findFirst({
        where: {
          restaurantId: membership.restaurantId,
          id: staffRoleId,
          archivedAt: null,
        },
      });
      if (!staffRole) throw new Error("Select an active staff role.");
      const permissionPreset = staffRole.permissions.includes("MANAGE_QUEUE") ? "HOST" : "FLOOR_STAFF";
      const existing = requestedStaffMemberId
        ? await tx.staffMember.findFirst({
            where: {
              id: requestedStaffMemberId,
              restaurantId: membership.restaurantId,
              archivedAt: null,
            },
          })
        : await tx.staffMember.findFirst({
            where: {
              restaurantId: membership.restaurantId,
              email: recipientEmail,
              archivedAt: null,
            },
          });
      if (requestedStaffMemberId && !existing) {
        throw new Error("That staff record is no longer available.");
      }
      if (existing?.membershipId || existing?.accessStatus === "ACTIVE") {
        throw new Error("That staff record already has active account access.");
      }
      if (existing) {
        const activeInvite = await tx.staffInvite.findFirst({
          where: {
            staffMemberId: existing.id,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          select: { id: true },
        });
        if (activeInvite) {
          throw new Error("That staff member already has an active invitation. Revoke or regenerate it from Team.");
        }
      }
      const staff = existing
        ? await tx.staffMember.update({
            where: { id: existing.id },
            data: {
              name,
              jobTitle,
              email: recipientEmail,
              contact: recipientEmail,
              staffRoleId: staffRole.id,
              permissionPreset,
              accessStatus: "INVITED",
              active: true,
              revision: { increment: 1 },
            },
          })
        : await tx.staffMember.create({
            data: {
              restaurantId: membership.restaurantId,
              name,
              jobTitle,
              email: recipientEmail,
              contact: recipientEmail,
              staffRoleId: staffRole.id,
              permissionPreset,
              accessStatus: "INVITED",
            },
          });
      await tx.staffInvite.create({
        data: {
          restaurantId: membership.restaurantId,
          staffMemberId: staff.id,
          staffRoleId: staffRole.id,
          recipientEmail,
          tokenHash: secrets.tokenHash,
          shortCodeHash: secrets.shortCodeHash,
          expiresAt,
          createdById: profile.id,
          createdByMembershipId: membership.id,
        },
      });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    console.error("[halina:staff-invite-create]", error);
    return {
      error: error instanceof Error
        ? error.message
        : "Halina could not create the invitation. Check that the committed staff migration is applied.",
    };
  }

  return {
    staffName: name,
    shortCode: secrets.shortCode,
    inviteUrl: `/join-staff/${secrets.token}`,
  };
}
