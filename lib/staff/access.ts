import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeStaffEmail,
  permissionsForPreset,
  type StaffPermission,
} from "@/lib/staff/policy";

export const WORK_SESSION_COOKIE = "halina_work_session";
export const WORK_SESSION_HOURS = 16;

export type EligibleWorkplace = {
  staffMemberId: string;
  restaurantId: string;
  restaurantName: string;
  restaurantLocation: string;
  staffName: string;
  jobTitle: string;
  permissionPreset: "MANAGER" | "HOST" | "FLOOR_STAFF";
  pinConfigured: boolean;
};

export type WorkContext = {
  profileId: string;
  sessionId: string;
  restaurantId: string;
  restaurantName: string;
  staffMemberId: string;
  staffName: string;
  jobTitle: string;
  permissionPreset: "MANAGER" | "HOST" | "FLOOR_STAFF";
  permissions: readonly StaffPermission[];
  startedAt: Date;
  expiresAt: Date;
};

export function isVerifiedHalinaUser(user: User) {
  return Boolean(user.email && user.email_confirmed_at);
}

export function createWorkSessionSecret() {
  return randomBytes(32).toString("base64url");
}

export function hashWorkSessionSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export async function getEligibleWorkplaces(user: User): Promise<EligibleWorkplace[]> {
  if (!isVerifiedHalinaUser(user) || !user.email) return [];
  const emailNormalized = normalizeStaffEmail(user.email);

  const staff = await prisma.staffMember.findMany({
    where: {
      emailNormalized,
      workAccessEnabled: true,
      active: true,
      archivedAt: null,
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      jobTitle: true,
      permissionPreset: true,
      restaurant: {
        select: {
          id: true,
          name: true,
          location: true,
          staffPinHash: true,
        },
      },
    },
  });

  return staff
    .map((member) => ({
      staffMemberId: member.id,
      restaurantId: member.restaurant.id,
      restaurantName: member.restaurant.name,
      restaurantLocation: member.restaurant.location,
      staffName: member.name,
      jobTitle: member.jobTitle,
      permissionPreset: member.permissionPreset,
      pinConfigured: Boolean(member.restaurant.staffPinHash),
    }))
    .sort((left, right) =>
      left.restaurantName.localeCompare(right.restaurantName, "en-PH"),
    );
}

export async function hasEligibleWorkplace(user: User) {
  if (!isVerifiedHalinaUser(user) || !user.email) return false;
  const count = await prisma.staffMember.count({
    where: {
      emailNormalized: normalizeStaffEmail(user.email),
      workAccessEnabled: true,
      active: true,
      archivedAt: null,
    },
  });
  return count > 0;
}

export async function getCurrentWorkContext(
  suppliedUser?: User,
): Promise<WorkContext | null> {
  let user = suppliedUser;
  if (!user) {
    const supabase = await createClient();
    const response = await supabase.auth.getUser();
    user = response.data.user ?? undefined;
  }
  if (!user || !isVerifiedHalinaUser(user) || !user.email) return null;

  const store = await cookies();
  const secret = store.get(WORK_SESSION_COOKIE)?.value;
  if (!secret) return null;

  const now = new Date();
  const session = await prisma.staffWorkSession.findUnique({
    where: { tokenHash: hashWorkSessionSecret(secret) },
    select: {
      id: true,
      profileId: true,
      startedAt: true,
      expiresAt: true,
      endedAt: true,
      restaurant: { select: { id: true, name: true } },
      staffMember: {
        select: {
          id: true,
          name: true,
          jobTitle: true,
          emailNormalized: true,
          permissionPreset: true,
          workAccessEnabled: true,
          active: true,
          archivedAt: true,
        },
      },
    },
  });

  if (
    !session ||
    session.profileId !== user.id ||
    session.endedAt ||
    session.expiresAt <= now ||
    !session.staffMember.workAccessEnabled ||
    !session.staffMember.active ||
    session.staffMember.archivedAt ||
    session.staffMember.emailNormalized !== normalizeStaffEmail(user.email)
  ) {
    return null;
  }

  return {
    profileId: user.id,
    sessionId: session.id,
    restaurantId: session.restaurant.id,
    restaurantName: session.restaurant.name,
    staffMemberId: session.staffMember.id,
    staffName: session.staffMember.name,
    jobTitle: session.staffMember.jobTitle,
    permissionPreset: session.staffMember.permissionPreset,
    permissions: permissionsForPreset(session.staffMember.permissionPreset),
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
  };
}

export async function setWorkSessionCookie(secret: string, expiresAt: Date) {
  const store = await cookies();
  store.set(WORK_SESSION_COOKIE, secret, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function endCurrentWorkSession(profileId?: string) {
  const store = await cookies();
  const secret = store.get(WORK_SESSION_COOKIE)?.value;
  try {
    if (secret) {
      const where = {
        tokenHash: hashWorkSessionSecret(secret),
        endedAt: null,
        ...(profileId ? { profileId } : {}),
      };
      await prisma.staffWorkSession.updateMany({
        where,
        data: { endedAt: new Date() },
      });
    }
  } finally {
    // The browser-side work grant must disappear even if the database is
    // temporarily unavailable. Server sessions still self-expire at expiresAt.
    store.delete(WORK_SESSION_COOKIE);
  }
}
