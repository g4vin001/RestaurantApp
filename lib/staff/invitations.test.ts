import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  createStaffInviteSecrets,
  hashStaffInviteSecret,
  normalizeStaffInviteCode,
} from "./invitations";
import { redeemStaffAccess } from "./redeem";

describe("staff invitation helpers", () => {
  it("creates distinct hashed secrets without storing the usable values as hashes", () => {
    const invite = createStaffInviteSecrets();
    expect(invite.token.length).toBeGreaterThan(20);
    expect(invite.shortCode).toMatch(/^[A-F0-9]{10}$/);
    expect(invite.tokenHash).toBe(hashStaffInviteSecret(invite.token));
    expect(invite.shortCodeHash).toBe(hashStaffInviteSecret(invite.shortCode));
    expect(invite.tokenHash).not.toBe(invite.token);
    expect(invite.shortCodeHash).not.toBe(invite.shortCode);
  });

  it("normalizes codes copied with spaces or separators", () => {
    expect(normalizeStaffInviteCode("ab12-cd34 ")).toBe("AB12CD34");
  });

  it("rejects a redeeming account whose verified email does not match", async () => {
    const createAttempt = vi.fn().mockResolvedValue({});
    const transaction = {
      staffInviteAttempt: {
        count: vi.fn().mockResolvedValue(0),
        create: createAttempt,
      },
      staffInvite: {
        findFirst: vi.fn().mockResolvedValue({
          id: "invite-1",
          restaurantId: "restaurant-1",
          recipientEmail: "staff@example.com",
          acceptedAt: null,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          staffMember: { active: true, archivedAt: null },
          staffRole: { id: "role-1" },
        }),
      },
    };
    const client = {
      $transaction: vi.fn((callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    } as unknown as PrismaClient;

    const result = await redeemStaffAccess(client, {
      profileId: "profile-1",
      verifiedEmail: "different@example.com",
      ipHash: "hashed-ip",
      token: "temporary-token",
    });

    expect(result).toEqual({
      ok: false,
      error: "Sign in with the verified email address this invitation was created for.",
    });
    expect(createAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ successful: false }) }),
    );
  });

  it("rate-limits failed redemption attempts before looking up another code", async () => {
    const findFirst = vi.fn();
    const transaction = {
      staffInviteAttempt: {
        count: vi.fn().mockResolvedValue(5),
      },
      staffInvite: { findFirst },
    };
    const client = {
      $transaction: vi.fn((callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    } as unknown as PrismaClient;

    const result = await redeemStaffAccess(client, {
      profileId: "profile-1",
      verifiedEmail: "staff@example.com",
      ipHash: "hashed-ip",
      code: "ABCDEF1234",
    });

    expect(result.ok).toBe(false);
    expect(result).toEqual(
      expect.objectContaining({ error: expect.stringContaining("Too many failed attempts") }),
    );
    expect(findFirst).not.toHaveBeenCalled();
  });
});
