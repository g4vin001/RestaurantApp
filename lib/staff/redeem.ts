import "server-only";

import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  hashStaffInviteSecret,
  normalizeStaffEmail,
  normalizeStaffInviteCode,
} from "@/lib/staff/invitations";

const RATE_WINDOW_MS = 15 * 60 * 1_000;
const MAX_FAILURES = 5;

export type RedeemInviteResult =
  | { ok: true; restaurantId: string }
  | { ok: false; error: string };

export async function redeemStaffAccess(
  client: PrismaClient,
  input: {
    profileId: string;
    verifiedEmail: string | null;
    ipHash: string;
    token?: string;
    code?: string;
  },
): Promise<RedeemInviteResult> {
  const tokenHash = input.token
    ? hashStaffInviteSecret(input.token)
    : undefined;
  const normalizedCode = input.code
    ? normalizeStaffInviteCode(input.code)
    : undefined;
  const shortCodeHash = normalizedCode
    ? hashStaffInviteSecret(normalizedCode)
    : undefined;
  if (!tokenHash && !shortCodeHash) {
    return { ok: false, error: "Enter a valid invitation link or code." };
  }
  const attemptedAt = new Date();
  const since = new Date(attemptedAt.getTime() - RATE_WINDOW_MS);

  return client.$transaction(
    async (tx) => {
      const failures = await tx.staffInviteAttempt.count({
        where: {
          successful: false,
          attemptedAt: { gte: since },
          OR: [{ profileId: input.profileId }, { ipHash: input.ipHash }],
        },
      });
      if (failures >= MAX_FAILURES) {
        return {
          ok: false as const,
          error: "Too many failed attempts. Wait 15 minutes before trying again.",
        };
      }

      const invite = await tx.staffInvite.findFirst({
        where: tokenHash ? { tokenHash } : { shortCodeHash },
        include: { staffMember: true, staffRole: true },
      });
      const failure = async (error: string) => {
        await tx.staffInviteAttempt.create({
          data: {
            inviteId: invite?.id,
            profileId: input.profileId,
            ipHash: input.ipHash,
            successful: false,
            attemptedAt,
          },
        });
        return { ok: false as const, error };
      };

      if (
        !invite ||
        invite.revokedAt ||
        invite.acceptedAt ||
        invite.expiresAt <= attemptedAt ||
        !invite.staffMember.active ||
        invite.staffMember.archivedAt
      ) {
        return failure("That invitation is invalid, expired, revoked, or already used.");
      }
      if (!input.verifiedEmail) {
        return failure("Verify your Halina account email before accepting this invitation.");
      }
      if (normalizeStaffEmail(input.verifiedEmail) !== normalizeStaffEmail(invite.recipientEmail)) {
        return failure("Sign in with the verified email address this invitation was created for.");
      }
      const existing = await tx.restaurantMembership.findUnique({
        where: {
          restaurantId_profileId: {
            restaurantId: invite.restaurantId,
            profileId: input.profileId,
          },
        },
      });
      if (existing && existing.role !== "STAFF") {
        return failure("This account already has owner or manager access to the restaurant.");
      }

      const claimed = await tx.staffInvite.updateMany({
        where: {
          id: invite.id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: attemptedAt },
        },
        data: { acceptedAt: attemptedAt, redeemedById: input.profileId },
      });
      if (claimed.count !== 1) {
        return failure("That invitation was already used on another device.");
      }

      const membership = await tx.restaurantMembership.upsert({
        where: {
          restaurantId_profileId: {
            restaurantId: invite.restaurantId,
            profileId: input.profileId,
          },
        },
        create: {
          restaurantId: invite.restaurantId,
          profileId: input.profileId,
          role: "STAFF",
          active: true,
        },
        update: { active: true },
      });
      await tx.staffMember.update({
        where: { id: invite.staffMemberId },
        data: {
          membershipId: membership.id,
          staffRoleId: invite.staffRoleId,
          email: invite.recipientEmail,
          accessStatus: "ACTIVE",
          active: true,
          revision: { increment: 1 },
        },
      });
      await tx.staffInviteAttempt.create({
        data: {
          inviteId: invite.id,
          profileId: input.profileId,
          ipHash: input.ipHash,
          successful: true,
          attemptedAt,
        },
      });
      return { ok: true as const, restaurantId: invite.restaurantId };
    },
    { isolationLevel: "Serializable", maxWait: 5_000, timeout: 10_000 },
  );
}
