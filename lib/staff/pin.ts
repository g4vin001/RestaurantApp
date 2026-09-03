import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PIN_PATTERN = /^\d{4}$/;
const KEY_LENGTH = 32;

export function isValidStaffPin(pin: string) {
  return PIN_PATTERN.test(pin);
}

export function hashStaffPin(pin: string) {
  if (!isValidStaffPin(pin)) {
    throw new Error("Staff PIN must contain exactly four digits.");
  }
  const salt = randomBytes(16);
  const derived = scryptSync(pin, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export function verifyStaffPin(pin: string, encodedHash: string) {
  if (!isValidStaffPin(pin)) return false;
  const [scheme, saltValue, hashValue] = encodedHash.split("$");
  if (scheme !== "scrypt" || !saltValue || !hashValue) return false;

  try {
    const salt = Buffer.from(saltValue, "base64url");
    const expected = Buffer.from(hashValue, "base64url");
    if (expected.length !== KEY_LENGTH) return false;
    const actual = scryptSync(pin, salt, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
