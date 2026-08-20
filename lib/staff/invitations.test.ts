import { describe, expect, it } from "vitest";
import {
  createStaffInviteSecrets,
  hashStaffInviteSecret,
  normalizeStaffInviteCode,
} from "./invitations";

describe("staff invitation helpers", () => {
  it("creates distinct hashed secrets without storing the usable values as hashes", () => {
    const invite = createStaffInviteSecrets();
    expect(invite.token.length).toBeGreaterThan(20);
    expect(invite.shortCode).toMatch(/^[A-F0-9]{8}$/);
    expect(invite.tokenHash).toBe(hashStaffInviteSecret(invite.token));
    expect(invite.shortCodeHash).toBe(hashStaffInviteSecret(invite.shortCode));
    expect(invite.tokenHash).not.toBe(invite.token);
    expect(invite.shortCodeHash).not.toBe(invite.shortCode);
  });

  it("normalizes codes copied with spaces or separators", () => {
    expect(normalizeStaffInviteCode("ab12-cd34 ")).toBe("AB12CD34");
  });
});
