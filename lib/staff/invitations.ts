import "server-only";
import { createHash, randomBytes } from "node:crypto";

export function hashStaffInviteSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function createStaffInviteSecrets() {
  const token = randomBytes(24).toString("base64url");
  const shortCode = randomBytes(4).toString("hex").toUpperCase();
  return {
    token,
    shortCode,
    tokenHash: hashStaffInviteSecret(token),
    shortCodeHash: hashStaffInviteSecret(shortCode),
  };
}

export function normalizeStaffInviteCode(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}
