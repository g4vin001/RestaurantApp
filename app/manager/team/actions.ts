"use server";

import { revalidatePath } from "next/cache";
import { getActiveManagerMembership } from "@/lib/auth/manager-membership";
import { ensureProfile } from "@/lib/auth/profile";
import { setFlash } from "@/lib/flash";
import { prisma } from "@/lib/prisma";
import {
  sanitizeStaffPermissions,
  staffPermissionDependencyError,
} from "@/lib/staff/permissions";
import { createStaffInviteSecrets } from "@/lib/staff/invitations";
import { createClient } from "@/lib/supabase/server";

async function requireManager() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Please log in again.");
  await ensureProfile(user);
  const membership = await getActiveManagerMembership(user.id);
  if (!membership) throw new Error("Manager access is required.");
  return { user, membership };
}

export async function createCustomStaffRole(formData: FormData) {
  try {
    const { membership } = await requireManager();
    const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 60) throw new Error("Role name must be 2-60 characters.");
    const permissions = sanitizeStaffPermissions(formData.getAll("permissions").map(String));
    const dependencyError = staffPermissionDependencyError(permissions);
    if (dependencyError) throw new Error(dependencyError);
    await prisma.staffRole.create({
      data: { restaurantId: membership.restaurantId, name, permissions },
    });
    await setFlash("message", `${name} was created.`);
  } catch (error) {
    await setFlash("error", error instanceof Error ? error.message : "Could not create that staff role.");
  }
  revalidatePath("/manager/team");
}

export async function updateCustomStaffRole(formData: FormData) {
  try {
    const { membership } = await requireManager();
    const roleId = String(formData.get("roleId") ?? "");
    const expectedRevision = Number(formData.get("expectedRevision"));
    const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
    if (!roleId || !Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new Error("That role changed. Refresh and try again.");
    }
    if (name.length < 2 || name.length > 60) {
      throw new Error("Role name must be 2-60 characters.");
    }
    const permissions = sanitizeStaffPermissions(formData.getAll("permissions").map(String));
    const dependencyError = staffPermissionDependencyError(permissions);
    if (dependencyError) throw new Error(dependencyError);
    const changed = await prisma.staffRole.updateMany({
      where: {
        id: roleId,
        restaurantId: membership.restaurantId,
        presetKey: null,
        archivedAt: null,
        revision: expectedRevision,
      },
      data: { name, permissions, revision: { increment: 1 } },
    });
    if (changed.count !== 1) {
      throw new Error("That role changed on another device. Refresh and try again.");
    }
    await setFlash("message", `${name} was updated.`);
  } catch (error) {
    await setFlash("error", error instanceof Error ? error.message : "Could not update that staff role.");
  }
  revalidatePath("/manager/team");
}

export async function archiveCustomStaffRole(formData: FormData) {
  try {
    const { membership } = await requireManager();
    const roleId = String(formData.get("roleId") ?? "");
    const role = await prisma.staffRole.findFirst({
      where: { id: roleId, restaurantId: membership.restaurantId, presetKey: null, archivedAt: null },
      include: { _count: { select: { staffMembers: { where: { archivedAt: null } } } } },
    });
    if (!role) throw new Error("Custom role was not found.");
    if (role._count.staffMembers) throw new Error("Move active staff to another role before archiving this role.");
    await prisma.staffRole.update({ where: { id: role.id }, data: { archivedAt: new Date(), revision: { increment: 1 } } });
    await setFlash("message", `${role.name} was archived.`);
  } catch (error) {
    await setFlash("error", error instanceof Error ? error.message : "Could not archive that role.");
  }
  revalidatePath("/manager/team");
}

export async function revokeStaffInvite(formData: FormData) {
  try {
    const { membership } = await requireManager();
    const inviteId = String(formData.get("inviteId") ?? "");
    await prisma.$transaction(async (tx) => {
      const invite = await tx.staffInvite.findFirst({
        where: {
          id: inviteId,
          restaurantId: membership.restaurantId,
          acceptedAt: null,
          revokedAt: null,
        },
        select: { id: true, staffMemberId: true },
      });
      if (!invite) throw new Error("That invitation is no longer active.");
      const changed = await tx.staffInvite.updateMany({
        where: { id: invite.id, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (changed.count !== 1) throw new Error("That invitation changed on another device.");
      await tx.staffMember.updateMany({
        where: {
          id: invite.staffMemberId,
          restaurantId: membership.restaurantId,
          accessStatus: "INVITED",
        },
        data: { accessStatus: "NOT_INVITED", revision: { increment: 1 } },
      });
    }, { isolationLevel: "Serializable" });
    await setFlash("message", "Staff invitation revoked.");
  } catch (error) {
    await setFlash("error", error instanceof Error ? error.message : "Could not revoke that invitation.");
  }
  revalidatePath("/manager/team");
}

export type RegenerateInviteState = { error?: string; inviteUrl?: string; shortCode?: string };

export async function regenerateStaffInvite(
  _state: RegenerateInviteState,
  formData: FormData,
): Promise<RegenerateInviteState> {
  try {
    const { membership } = await requireManager();
    const inviteId = String(formData.get("inviteId") ?? "");
    const invite = await prisma.staffInvite.findFirst({
      where: { id: inviteId, restaurantId: membership.restaurantId, acceptedAt: null },
    });
    if (!invite) return { error: "Only an unaccepted invitation can be regenerated." };
    const secrets = createStaffInviteSecrets();
    await prisma.$transaction(async (tx) => {
      await tx.staffInvite.update({
        where: { id: invite.id },
        data: {
          tokenHash: secrets.tokenHash,
          shortCodeHash: secrets.shortCodeHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
          revokedAt: null,
        },
      });
      await tx.staffMember.update({
        where: { id: invite.staffMemberId },
        data: {
          accessStatus: "INVITED",
          active: true,
          revision: { increment: 1 },
        },
      });
    }, { isolationLevel: "Serializable" });
    revalidatePath("/manager/team");
    return { inviteUrl: `/join-staff/${secrets.token}`, shortCode: secrets.shortCode };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not regenerate that invitation." };
  }
}
