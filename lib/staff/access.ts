import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import type {
  RestaurantEnvironment,
  StaffPermission,
  StaffPermissionPreset,
} from "@/lib/domain/types";
import { prisma } from "@/lib/prisma";
import { normalizeStaffEmail, permissionsForPreset } from "@/lib/staff/policy";
import { createClient } from "@/lib/supabase/server";

export const WORK_SESSION_COOKIE = "halina_work_session";
export const WORK_SESSION_HOURS = 16;

export type EligibleWorkplace = {
  staffMemberId: string;
  restaurantId: string;
  restaurantName: string;
  restaurantLocation: string;
  staffName: string;
  jobTitle: string;
  permissionPreset: StaffPermissionPreset;
  staffRoleName: string | null;
  pinConfigured: boolean;
};

export type WorkContext = {
  profileId: string;
  sessionId: string;
  membershipId: string;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  restaurantEnvironment: RestaurantEnvironment;
  staffMemberId: string;
  staffName: string;
  jobTitle: string;
  permissionPreset: StaffPermissionPreset;
  staffRoleName: string | null;
  permissions: readonly StaffPermission[];
  startedAt: Date;
  expiresAt: Date;
};

// Kept for compatibility with the older invitation flow while the product uses
// whitelist + PIN clock-in as the primary staff entry path.
export async function getActiveStaffAccess(profileId: string) {
  return prisma.restaurantMembership.findFirst({
    where: {
      profileId,
      active: true,
      role: "STAFF",
      restaurant: { archivedAt: null },
      staffRecord: {
        active: true,
        archivedAt: null,
        accessStatus: "ACTIVE",
        staffRole: { archivedAt: null },
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      restaurantId: true,
      restaurant: {
        select: {
          id: true,
          name: true,
          slug: true,
          environment: true,
          archivedAt: true,
        },
      },
      staffRecord: {
        select: {
          id: true,
          name: true,
          jobTitle: true,
          permissionPreset: true,
          revision: true,
          staffRole: {
            select: { id: true, name: true, permissions: true, archivedAt: true },
          },
        },
      },
    },
  });
}

export function isVerifiedHalinaUser(user: User) {
  return Boolean(user.email && user.email_confirmed_at);
}

export function createWorkSessionSecret() {
  return randomBytes(32).toString("base64url");
}

export function hashWorkSessionSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export async function getEligibleWorkplaces(
  user: User,
): Promise<EligibleWorkplace[]> {
  if (!isVerifiedHalinaUser(user) || !user.email) return [];
  const emailNormalized = normalizeStaffEmail(user.email);

  const staff = await prisma.staffMember.findMany({
    where: {
      emailNormalized,
      workAccessEnabled: true,
      active: true,
      archivedAt: null,
      restaurant: { archivedAt: null },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      jobTitle: true,
      permissionPreset: true,
      staffRole: {
        select: { name: true, archivedAt: true },
      },
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
    .filter((member) => !member.staffRole?.archivedAt)
    .map((member) => ({
      staffMemberId: member.id,
      restaurantId: member.restaurant.id,
      restaurantName: member.restaurant.name,
      restaurantLocation: member.restaurant.location,
      staffName: member.name,
      jobTitle: member.jobTitle,
      permissionPreset: member.permissionPreset,
      staffRoleName: member.staffRole?.name ?? null,
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
      restaurant: { archivedAt: null },
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
      lastSeenAt: true,
      expiresAt: true,
      endedAt: true,
      restaurant: {
        select: {
          id: true,
          name: true,
          slug: true,
          environment: true,
          archivedAt: true,
        },
      },
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
          membershipId: true,
          membership: {
            select: {
              id: true,
              profileId: true,
              restaurantId: true,
              role: true,
              active: true,
            },
          },
          staffRole: {
            select: {
              name: true,
              permissions: true,
              archivedAt: true,
            },
          },
        },
      },
    },
  });

  const membership = session?.staffMember.membership;
  if (
    !session ||
    session.profileId !== user.id ||
    session.endedAt ||
    session.expiresAt <= now ||
    session.restaurant.archivedAt ||
    !session.staffMember.workAccessEnabled ||
    !session.staffMember.active ||
    session.staffMember.archivedAt ||
    session.staffMember.staffRole?.archivedAt ||
    session.staffMember.emailNormalized !== normalizeStaffEmail(user.email) ||
    !membership ||
    membership.id !== session.staffMember.membershipId ||
    membership.profileId !== user.id ||
    membership.restaurantId !== session.restaurant.id ||
    membership.role !== "STAFF" ||
    !membership.active
  ) {
    return null;
  }

  if (now.getTime() - session.lastSeenAt.getTime() >= 5 * 60_000) {
    void prisma.staffWorkSession
      .updateMany({
        where: { id: session.id, endedAt: null },
        data: { lastSeenAt: now },
      })
      .catch(() => undefined);
  }

  const rolePermissions = session.staffMember.staffRole?.permissions;
  return {
    profileId: user.id,
    sessionId: session.id,
    membershipId: membership.id,
    restaurantId: session.restaurant.id,
    restaurantName: session.restaurant.name,
    restaurantSlug: session.restaurant.slug,
    restaurantEnvironment: session.restaurant.environment,
    staffMemberId: session.staffMember.id,
    staffName: session.staffMember.name,
    jobTitle: session.staffMember.jobTitle,
    permissionPreset: session.staffMember.permissionPreset,
    staffRoleName: session.staffMember.staffRole?.name ?? null,
    permissions:
      rolePermissions && rolePermissions.length > 0
        ? rolePermissions
        : permissionsForPreset(session.staffMember.permissionPreset),
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
      await prisma.staffWorkSession.updateMany({
        where: {
          tokenHash: hashWorkSessionSecret(secret),
          endedAt: null,
          ...(profileId ? { profileId } : {}),
        },
        data: { endedAt: new Date() },
      });
    }
  } finally {
    // The browser-side grant disappears even if the database is unavailable.
    // Server sessions still have a hard expiresAt limit.
    store.delete(WORK_SESSION_COOKIE);
  }
}
