"use server";

import { redirect } from "next/navigation";
import { ensureProfile } from "@/lib/auth/profile";
import { prisma } from "@/lib/prisma";
import {
  createWorkSessionSecret,
  endCurrentWorkSession,
  hashWorkSessionSecret,
  isVerifiedHalinaUser,
  setWorkSessionCookie,
  WORK_SESSION_HOURS,
} from "@/lib/staff/access";
import { isValidStaffPin, verifyStaffPin } from "@/lib/staff/pin";
import { normalizeStaffEmail } from "@/lib/staff/policy";
import { createClient } from "@/lib/supabase/server";

const RATE_WINDOW_MS = 15 * 60 * 1_000;
const MAX_FAILURES = 5;

export type ClockInState = {
  error?: string;
};

export async function clockIn(
  _previousState: ClockInState,
  formData: FormData,
): Promise<ClockInState> {
  const restaurantId = String(formData.get("restaurantId") ?? "");
  const pin = String(formData.get("pin") ?? "").trim();
  if (!restaurantId) return { error: "Choose a restaurant to clock in." };
  if (!isValidStaffPin(pin)) return { error: "Enter the restaurant's 4-digit PIN." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent("/work")}`);
  if (!isVerifiedHalinaUser(user) || !user.email) {
    return { error: "Verify your Halina account email before using restaurant work access." };
  }

  try {
    await ensureProfile(user);
  } catch (error) {
    console.error("[halina:clock-in-profile]", error);
    return { error: "Halina could not load your account right now. Please try again." };
  }

  const emailNormalized = normalizeStaffEmail(user.email);
  const staff = await prisma.staffMember.findFirst({
    where: {
      restaurantId,
      emailNormalized,
      workAccessEnabled: true,
      active: true,
      archivedAt: null,
      restaurant: { archivedAt: null },
    },
    select: {
      id: true,
      restaurant: { select: { staffPinHash: true } },
    },
  });
  if (!staff) {
    return {
      error: "Your verified Halina email is not currently whitelisted for this restaurant.",
    };
  }
  if (!staff.restaurant.staffPinHash) {
    return { error: "This restaurant has not configured staff clock-in yet." };
  }

  const now = new Date();
  const since = new Date(now.getTime() - RATE_WINDOW_MS);
  const recentFailures = await prisma.staffPinAttempt.count({
    where: {
      restaurantId,
      profileId: user.id,
      successful: false,
      attemptedAt: { gte: since },
    },
  });
  if (recentFailures >= MAX_FAILURES) {
    return {
      error: "Too many incorrect PIN attempts. Wait 15 minutes before trying again.",
    };
  }

  if (!verifyStaffPin(pin, staff.restaurant.staffPinHash)) {
    await prisma.staffPinAttempt.create({
      data: {
        restaurantId,
        profileId: user.id,
        successful: false,
        attemptedAt: now,
      },
    });
    return { error: "Incorrect restaurant PIN." };
  }

  const secret = createWorkSessionSecret();
  const expiresAt = new Date(now.getTime() + WORK_SESSION_HOURS * 60 * 60 * 1_000);

  try {
    await prisma.$transaction(
      async (tx) => {
        const currentStaff = await tx.staffMember.findFirst({
          where: {
            id: staff.id,
            restaurantId,
            emailNormalized,
            workAccessEnabled: true,
            active: true,
            archivedAt: null,
            restaurant: { archivedAt: null },
          },
          select: {
            id: true,
            membershipId: true,
            restaurant: { select: { staffPinHash: true } },
          },
        });
        if (!currentStaff) {
          throw new Error("Your restaurant work access changed before clock-in completed.");
        }
        if (
          !currentStaff.restaurant.staffPinHash ||
          !verifyStaffPin(pin, currentStaff.restaurant.staffPinHash)
        ) {
          throw new Error("The restaurant PIN changed. Enter the new PIN and try again.");
        }

        const existingMembership = await tx.restaurantMembership.findUnique({
          where: {
            restaurantId_profileId: {
              restaurantId,
              profileId: user.id,
            },
          },
          select: { id: true, role: true },
        });
        if (
          existingMembership &&
          existingMembership.role !== "STAFF"
        ) {
          throw new Error(
            "This Halina account already has manager access to this restaurant. Use the manager workspace instead of staff clock-in.",
          );
        }

        const membership = existingMembership
          ? await tx.restaurantMembership.update({
              where: { id: existingMembership.id },
              data: { active: true },
              select: { id: true },
            })
          : await tx.restaurantMembership.create({
              data: {
                restaurantId,
                profileId: user.id,
                role: "STAFF",
                active: true,
              },
              select: { id: true },
            });

        await tx.staffWorkSession.updateMany({
          where: { profileId: user.id, endedAt: null },
          data: { endedAt: now },
        });
        await tx.staffPinAttempt.deleteMany({
          where: {
            restaurantId,
            profileId: user.id,
            successful: false,
          },
        });
        await tx.staffPinAttempt.create({
          data: {
            restaurantId,
            profileId: user.id,
            successful: true,
            attemptedAt: now,
          },
        });
        await tx.staffWorkSession.create({
          data: {
            restaurantId,
            staffMemberId: currentStaff.id,
            profileId: user.id,
            tokenHash: hashWorkSessionSecret(secret),
            startedAt: now,
            lastSeenAt: now,
            expiresAt,
          },
        });
        await tx.staffMember.update({
          where: { id: currentStaff.id },
          data: {
            membershipId: membership.id,
            accessStatus: "WHITELISTED",
            lastClockedInAt: now,
            revision: { increment: 1 },
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    console.error("[halina:clock-in]", error);
    return {
      error: error instanceof Error ? error.message : "Halina could not clock you in.",
    };
  }

  await setWorkSessionCookie(secret, expiresAt);
  redirect("/ops");
}

export async function clockOut() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await endCurrentWorkSession(user?.id);
  redirect("/");
}
