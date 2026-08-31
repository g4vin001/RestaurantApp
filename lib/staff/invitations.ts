import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";

export function hashStaffInviteSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function createStaffInviteSecrets() {
  const token = randomBytes(24).toString("base64url");
  const shortCode = randomBytes(5).toString("hex").toUpperCase();
  return {
    token,
    shortCode,
    tokenHash: hashStaffInviteSecret(token),
    shortCodeHash: hashStaffInviteSecret(shortCode),
  };
}

export function normalizeStaffEmail(value: string) {
  return value.trim().toLowerCase();
}

export function hashRequestAddress(value: string) {
  const secret =
    process.env.HALINA_RATE_LIMIT_SECRET ?? process.env.ADMIN_PANEL_PASSWORD;
  if (!secret) {
    throw new Error("HALINA_RATE_LIMIT_SECRET is required for invitation rate limiting.");
  }
  return createHmac("sha256", secret).update(value || "unknown").digest("hex");
}

export function normalizeStaffInviteCode(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}
