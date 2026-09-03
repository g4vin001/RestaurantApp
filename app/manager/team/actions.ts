"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveManagerMembership } from "@/lib/auth/manager-membership";
import { ensureProfile } from "@/lib/auth/profile";
import { setFlash } from "@/lib/flash";
import { prisma } from "@/lib/prisma";
import { createStaffInviteSecrets } from "@/lib/staff/invitations";
import { hashStaffPin, isValidStaffPin } from "@/lib/staff/pin";
import {
  isValidStaffEmail,
  normalizeStaffEmail,
} from "@/lib/staff/policy";
import {
  sanitizeStaffPermissions,
  staffPermissionDependencyError,
} from "@/lib/staff/permissions";
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

function revalidateTeamWork() {
  revalidatePath("/manager/team");
  revalidatePath("/work");
  revalidatePath("/ops");
  revalidatePath("/");
}

async function finishStaffAction(message: string) {
  revalidateTeamWork();
  await setFlash("message", message);
  redirect("/manager/team");
}

async function failStaffAction(message: string) {
  await setFlash("error", message);
  redirect("/manager/team");
}

function optionalText(formData: FormData, key: string, maxLength: number) {
  const value = String(formData.get(key) ?? "").trim();
  if (value.length > maxLength) throw new Error(`${key} is too long.`);
  return value || null;
}

function presetForRole(role: {
  presetKey: string | null;
  permissions: readonly string[];
}) {
  if (role.presetKey === "FLOOR_STAFF") return "FLOOR_STAFF" as const;
  if (role.presetKey === "HOST") return "HOST" as const;
  if (role.presetKey === "SHIFT_LEAD") return "MANAGER" as const;
  if (role.permissions.includes("CORRECT_RECENT_ACTION")) return "MANAGER" as const;
  if (
    role.permissions.some((permission) =>
      ["VIEW_CONTACT_DETAILS", "MANAGE_QUEUE", "SEAT_PARTIES"].includes(permission),
    )
  ) {
    return "HOST" as const;
  }
  return "FLOOR_STAFF" as const;
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
          workAccessEnabled: false,
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

export async function saveStaffMember(formData: FormData) {
  let manager: Awaited<ReturnType<typeof requireManager>>;
  try {
    manager = await requireManager();
  } catch (error) {
    return failStaffAction(error instanceof Error ? error.message : "Manager access is required.");
  }
  const { membership } = manager;
  const staffId = String(formData.get("staffId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const jobTitle = String(formData.get("jobTitle") ?? "").trim().replace(/\s+/g, " ");
  const rawEmail = String(formData.get("email") ?? "").trim();
  const requestedRoleId = String(formData.get("staffRoleId") ?? "").trim();
  const workAccessEnabled = formData.get("workAccessEnabled") === "on";

  if (name.length < 2 || name.length > 80) {
    return failStaffAction("Enter a staff name between 2 and 80 characters.");
  }
  if (jobTitle.length < 2 || jobTitle.length > 80) {
    return failStaffAction("Enter a job title between 2 and 80 characters.");
  }
  if (rawEmail && !isValidStaffEmail(rawEmail)) {
    return failStaffAction("Enter a valid Halina account email address.");
  }
  if (workAccessEnabled && !rawEmail) {
    return failStaffAction("A verified Halina email is required when work access is enabled.");
  }

  let contact: string | null;
  try {
    contact = optionalText(formData, "contact", 160);
  } catch {
    return failStaffAction("Contact details must be 160 characters or fewer.");
  }
  const email = rawEmail ? normalizeStaffEmail(rawEmail) : null;
  const now = new Date();

  try {
    await prisma.$transaction(
      async (tx) => {
        const existing = staffId
          ? await tx.staffMember.findFirst({
              where: {
                id: staffId,
                restaurantId: membership.restaurantId,
                archivedAt: null,
              },
              select: {
                id: true,
                emailNormalized: true,
                workAccessEnabled: true,
                staffRoleId: true,
                membershipId: true,
              },
            })
          : null;
        if (staffId && !existing) {
          throw new Error("That staff record is no longer available.");
        }

        if (email) {
          const duplicate = await tx.staffMember.findFirst({
            where: {
              restaurantId: membership.restaurantId,
              emailNormalized: email,
              archivedAt: null,
              ...(staffId ? { id: { not: staffId } } : {}),
            },
            select: { id: true },
          });
          if (duplicate) {
            throw new Error(
              "That email is already assigned to another staff record in this restaurant.",
            );
          }
        }

        let role = requestedRoleId
          ? await tx.staffRole.findFirst({
              where: {
                id: requestedRoleId,
                restaurantId: membership.restaurantId,
                archivedAt: null,
              },
              select: { id: true, presetKey: true, permissions: true },
            })
          : null;
        if (!role && existing?.staffRoleId) {
          role = await tx.staffRole.findFirst({
            where: {
              id: existing.staffRoleId,
              restaurantId: membership.restaurantId,
              archivedAt: null,
            },
            select: { id: true, presetKey: true, permissions: true },
          });
        }
        if (!role) {
          role = await tx.staffRole.findFirst({
            where: {
              restaurantId: membership.restaurantId,
              presetKey: "FLOOR_STAFF",
              archivedAt: null,
            },
            select: { id: true, presetKey: true, permissions: true },
          });
        }
        if (!role) throw new Error("Select a valid staff role.");
        const permissionPreset = presetForRole(role);

        if (existing) {
          const identityChanged =
            existing.emailNormalized !== email ||
            existing.workAccessEnabled !== workAccessEnabled;
          await tx.staffMember.update({
            where: { id: existing.id },
            data: {
              name,
              jobTitle,
              contact,
              email,
              emailNormalized: email,
              permissionPreset,
              staffRoleId: role.id,
              workAccessEnabled,
              accessStatus: workAccessEnabled ? "WHITELISTED" : "ACCESS_DISABLED",
              ...(identityChanged && existing.membershipId
                ? { membershipId: null }
                : {}),
              revision: { increment: 1 },
            },
          });
          if (identityChanged || !workAccessEnabled) {
            await tx.staffWorkSession.updateMany({
              where: { staffMemberId: existing.id, endedAt: null },
              data: { endedAt: now },
            });
            if (existing.membershipId) {
              await tx.restaurantMembership.updateMany({
                where: {
                  id: existing.membershipId,
                  restaurantId: membership.restaurantId,
                  role: "STAFF",
                },
                data: { active: false },
              });
            }
            await tx.staffInvite.updateMany({
              where: {
                staffMemberId: existing.id,
                acceptedAt: null,
                revokedAt: null,
              },
              data: { revokedAt: now },
            });
          }
        } else {
          await tx.staffMember.create({
            data: {
              restaurantId: membership.restaurantId,
              name,
              jobTitle,
              contact,
              email,
              emailNormalized: email,
              permissionPreset,
              staffRoleId: role.id,
              workAccessEnabled,
              accessStatus: workAccessEnabled ? "WHITELISTED" : "ACCESS_DISABLED",
            },
          });
        }
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    console.error("[halina:staff-save]", error);
    return failStaffAction(
      error instanceof Error ? error.message : "Halina could not save that staff record.",
    );
  }

  return finishStaffAction(staffId ? "Staff record updated." : "Staff member added.");
}

export async function setStaffActive(formData: FormData) {
  let manager: Awaited<ReturnType<typeof requireManager>>;
  try {
    manager = await requireManager();
  } catch (error) {
    return failStaffAction(error instanceof Error ? error.message : "Manager access is required.");
  }
  const { membership } = manager;
  const staffId = String(formData.get("staffId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const staff = await tx.staffMember.findFirst({
        where: {
          id: staffId,
          restaurantId: membership.restaurantId,
          archivedAt: null,
        },
        select: { id: true, workAccessEnabled: true, membershipId: true },
      });
      if (!staff) throw new Error("That staff record is no longer available.");
      await tx.staffMember.update({
        where: { id: staff.id },
        data: {
          active,
          accessStatus:
            active && staff.workAccessEnabled ? "WHITELISTED" : "ACCESS_DISABLED",
          ...(!active && staff.membershipId ? { membershipId: null } : {}),
          revision: { increment: 1 },
        },
      });
      if (!active) {
        await tx.staffWorkSession.updateMany({
          where: { staffMemberId: staff.id, endedAt: null },
          data: { endedAt: now },
        });
        if (staff.membershipId) {
          await tx.restaurantMembership.updateMany({
            where: {
              id: staff.membershipId,
              restaurantId: membership.restaurantId,
              role: "STAFF",
            },
            data: { active: false },
          });
        }
      }
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    console.error("[halina:staff-status]", error);
    return failStaffAction(
      error instanceof Error ? error.message : "Halina could not change staff status.",
    );
  }

  return finishStaffAction(
    active ? "Staff member reactivated." : "Staff member deactivated and clocked out.",
  );
}

export async function archiveStaffMember(formData: FormData) {
  let manager: Awaited<ReturnType<typeof requireManager>>;
  try {
    manager = await requireManager();
  } catch (error) {
    return failStaffAction(error instanceof Error ? error.message : "Manager access is required.");
  }
  const { membership } = manager;
  const staffId = String(formData.get("staffId") ?? "");
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const staff = await tx.staffMember.findFirst({
        where: {
          id: staffId,
          restaurantId: membership.restaurantId,
          archivedAt: null,
        },
        select: { id: true, membershipId: true },
      });
      if (!staff) throw new Error("That staff record is no longer available.");
      await tx.staffMember.update({
        where: { id: staff.id },
        data: {
          active: false,
          workAccessEnabled: false,
          accessStatus: "ACCESS_DISABLED",
          emailNormalized: null,
          membershipId: null,
          archivedAt: now,
          revision: { increment: 1 },
        },
      });
      await tx.staffWorkSession.updateMany({
        where: { staffMemberId: staff.id, endedAt: null },
        data: { endedAt: now },
      });
      await tx.staffInvite.updateMany({
        where: { staffMemberId: staff.id, acceptedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      if (staff.membershipId) {
        await tx.restaurantMembership.updateMany({
          where: {
            id: staff.membershipId,
            restaurantId: membership.restaurantId,
            role: "STAFF",
          },
          data: { active: false },
        });
      }
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    console.error("[halina:staff-archive]", error);
    return failStaffAction(
      error instanceof Error ? error.message : "Halina could not archive that staff record.",
    );
  }

  return finishStaffAction("Staff record archived and work access removed.");
}

export async function forceClockOutStaff(formData: FormData) {
  let manager: Awaited<ReturnType<typeof requireManager>>;
  try {
    manager = await requireManager();
  } catch (error) {
    return failStaffAction(error instanceof Error ? error.message : "Manager access is required.");
  }
  const { membership } = manager;
  const staffId = String(formData.get("staffId") ?? "");
  const staff = await prisma.staffMember.findFirst({
    where: {
      id: staffId,
      restaurantId: membership.restaurantId,
      archivedAt: null,
    },
    select: { id: true },
  });
  if (!staff) return failStaffAction("That staff record is no longer available.");

  await prisma.staffWorkSession.updateMany({
    where: { staffMemberId: staff.id, endedAt: null },
    data: { endedAt: new Date() },
  });
  return finishStaffAction("Active work sessions for that staff member were ended.");
}

export async function setRestaurantStaffPin(formData: FormData) {
  let manager: Awaited<ReturnType<typeof requireManager>>;
  try {
    manager = await requireManager();
  } catch (error) {
    return failStaffAction(error instanceof Error ? error.message : "Manager access is required.");
  }
  const { membership } = manager;
  const pin = String(formData.get("pin") ?? "").trim();
  if (!isValidStaffPin(pin)) {
    return failStaffAction("Staff clock-in PIN must contain exactly four digits.");
  }

  try {
    await prisma.restaurant.update({
      where: { id: membership.restaurantId },
      data: {
        staffPinHash: hashStaffPin(pin),
        staffPinChangedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("[halina:staff-pin-set]", error);
    return failStaffAction("Halina could not save the staff PIN.");
  }
  return finishStaffAction(
    "Restaurant staff PIN updated. Existing clocked-in sessions remain active.",
  );
}

export async function endAllStaffWorkSessions() {
  let manager: Awaited<ReturnType<typeof requireManager>>;
  try {
    manager = await requireManager();
  } catch (error) {
    return failStaffAction(error instanceof Error ? error.message : "Manager access is required.");
  }
  await prisma.staffWorkSession.updateMany({
    where: {
      restaurantId: manager.membership.restaurantId,
      endedAt: null,
    },
    data: { endedAt: new Date() },
  });
  return finishStaffAction("All active staff work sessions were ended.");
}
