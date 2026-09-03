"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveManagerMembership } from "@/lib/auth/manager-membership";
import { setFlash } from "@/lib/flash";
import { prisma } from "@/lib/prisma";
import { hashStaffPin, isValidStaffPin } from "@/lib/staff/pin";
import {
  isValidStaffEmail,
  normalizeStaffEmail,
} from "@/lib/staff/policy";
import { createClient } from "@/lib/supabase/server";

const PRESETS = new Set(["MANAGER", "HOST", "FLOOR_STAFF"] as const);

type StaffPreset = "MANAGER" | "HOST" | "FLOOR_STAFF";

async function requireManager() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/manager/team");

  const membership = await getActiveManagerMembership(user.id);
  if (!membership) redirect("/onboarding/restaurant");
  return { user, membership };
}

async function finish(message: string) {
  revalidatePath("/manager/team");
  revalidatePath("/work");
  revalidatePath("/");
  await setFlash("message", message);
  redirect("/manager/team");
}

async function fail(message: string) {
  await setFlash("error", message);
  redirect("/manager/team");
}

function optionalText(formData: FormData, key: string, maxLength: number) {
  const value = String(formData.get(key) ?? "").trim();
  if (value.length > maxLength) {
    throw new Error(`${key} is too long.`);
  }
  return value || null;
}

export async function saveStaffMember(formData: FormData) {
  const { membership } = await requireManager();
  const staffId = String(formData.get("staffId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const jobTitle = String(formData.get("jobTitle") ?? "").trim();
  const rawEmail = String(formData.get("email") ?? "").trim();
  const permissionPreset = String(formData.get("permissionPreset") ?? "") as StaffPreset;
  const workAccessEnabled = formData.get("workAccessEnabled") === "on";

  if (name.length < 2 || name.length > 80) {
    return fail("Enter a staff name between 2 and 80 characters.");
  }
  if (jobTitle.length < 2 || jobTitle.length > 80) {
    return fail("Enter a job title between 2 and 80 characters.");
  }
  if (!PRESETS.has(permissionPreset)) {
    return fail("Choose a valid operations permission preset.");
  }
  if (rawEmail && !isValidStaffEmail(rawEmail)) {
    return fail("Enter a valid Halina account email address.");
  }
  if (workAccessEnabled && !rawEmail) {
    return fail("A verified Halina email is required when work access is enabled.");
  }

  let contact: string | null;
  try {
    contact = optionalText(formData, "contact", 160);
  } catch {
    return fail("Contact details must be 160 characters or fewer.");
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
              workAccessEnabled,
              accessStatus: workAccessEnabled ? "WHITELISTED" : "ACCESS_DISABLED",
            },
          });
          if (identityChanged || !workAccessEnabled) {
            await tx.staffWorkSession.updateMany({
              where: {
                staffMemberId: existing.id,
                endedAt: null,
              },
              data: { endedAt: now },
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
    return fail(error instanceof Error ? error.message : "Halina could not save that staff record.");
  }

  return finish(staffId ? "Staff record updated." : "Staff member added.");
}

export async function setStaffActive(formData: FormData) {
  const { membership } = await requireManager();
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
        select: { id: true, workAccessEnabled: true },
      });
      if (!staff) throw new Error("That staff record is no longer available.");
      await tx.staffMember.update({
        where: { id: staff.id },
        data: {
          active,
          accessStatus:
            active && staff.workAccessEnabled ? "WHITELISTED" : "ACCESS_DISABLED",
        },
      });
      if (!active) {
        await tx.staffWorkSession.updateMany({
          where: { staffMemberId: staff.id, endedAt: null },
          data: { endedAt: now },
        });
      }
    });
  } catch (error) {
    console.error("[halina:staff-status]", error);
    return fail(error instanceof Error ? error.message : "Halina could not change staff status.");
  }

  return finish(active ? "Staff member reactivated." : "Staff member deactivated and clocked out.");
}

export async function archiveStaffMember(formData: FormData) {
  const { membership } = await requireManager();
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
        select: { id: true },
      });
      if (!staff) throw new Error("That staff record is no longer available.");
      await tx.staffMember.update({
        where: { id: staff.id },
        data: {
          active: false,
          workAccessEnabled: false,
          accessStatus: "ACCESS_DISABLED",
          // Keep the display email for history, but release its normalized
          // whitelist key so the restaurant can later hire/re-add that account.
          emailNormalized: null,
          archivedAt: now,
        },
      });
      await tx.staffWorkSession.updateMany({
        where: { staffMemberId: staff.id, endedAt: null },
        data: { endedAt: now },
      });
    });
  } catch (error) {
    console.error("[halina:staff-archive]", error);
    return fail(error instanceof Error ? error.message : "Halina could not archive that staff record.");
  }

  return finish("Staff record archived and work access removed.");
}

export async function forceClockOutStaff(formData: FormData) {
  const { membership } = await requireManager();
  const staffId = String(formData.get("staffId") ?? "");
  const staff = await prisma.staffMember.findFirst({
    where: {
      id: staffId,
      restaurantId: membership.restaurantId,
      archivedAt: null,
    },
    select: { id: true },
  });
  if (!staff) return fail("That staff record is no longer available.");

  await prisma.staffWorkSession.updateMany({
    where: { staffMemberId: staff.id, endedAt: null },
    data: { endedAt: new Date() },
  });
  return finish("Active work sessions for that staff member were ended.");
}

export async function setRestaurantStaffPin(formData: FormData) {
  const { membership } = await requireManager();
  const pin = String(formData.get("pin") ?? "").trim();
  if (!isValidStaffPin(pin)) {
    return fail("Staff clock-in PIN must contain exactly four digits.");
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
    return fail("Halina could not save the staff PIN.");
  }
  return finish("Restaurant staff PIN updated. Existing clocked-in sessions remain active.");
}

export async function endAllStaffWorkSessions() {
  const { membership } = await requireManager();
  await prisma.staffWorkSession.updateMany({
    where: {
      restaurantId: membership.restaurantId,
      endedAt: null,
    },
    data: { endedAt: new Date() },
  });
  return finish("All active staff work sessions were ended.");
}
