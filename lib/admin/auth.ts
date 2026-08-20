import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const UNLOCK_COOKIE = "admin_unlocked";
const UNLOCK_MAX_AGE_SECONDS = 4 * 60 * 60;

function safeEqual(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

// Gate one: the signed-in Supabase account must match this allowlisted
// email. Gate two (below) is a separate shared secret unrelated to that
// account's password — two independent things to know to get in.
export function isAdminEmail(email: string | null | undefined) {
  const adminEmail = process.env.ADMIN_EMAIL;
  return Boolean(adminEmail) && email === adminEmail;
}

// Bound to the specific user id so the unlock cookie can't be replayed by a
// different account, and never stores the password itself in the cookie.
function unlockToken(userId: string, password: string) {
  return createHash("sha256").update(`${userId}:${password}`).digest("hex");
}

export async function verifyAdminPassword(userId: string, submitted: string) {
  const password = process.env.ADMIN_PANEL_PASSWORD;
  if (!password || !submitted) return false;
  return safeEqual(unlockToken(userId, password), unlockToken(userId, submitted));
}

export async function isAdminUnlocked(userId: string) {
  const password = process.env.ADMIN_PANEL_PASSWORD;
  if (!password) return false;
  const store = await cookies();
  const cookieValue = store.get(UNLOCK_COOKIE)?.value;
  if (!cookieValue) return false;
  return safeEqual(unlockToken(userId, password), cookieValue);
}

export async function unlockAdminSession(userId: string) {
  const password = process.env.ADMIN_PANEL_PASSWORD;
  if (!password) return;
  const store = await cookies();
  store.set(UNLOCK_COOKIE, unlockToken(userId, password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: UNLOCK_MAX_AGE_SECONDS,
  });
}
