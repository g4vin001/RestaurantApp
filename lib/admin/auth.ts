import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getCurrentAuthUser } from "@/lib/auth/current-identity";

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
export function isPlatformAdmin(user: User | null): user is User & { email: string } {
  return Boolean(
    user?.email && user.email_confirmed_at && !user.is_anonymous &&
    user.id === process.env.ADMIN_USER_ID &&
    user.email.toLowerCase() === process.env.ADMIN_EMAIL?.trim().toLowerCase(),
  );
}

export async function requirePlatformAdmin(unlocked = true) {
  const user = await getCurrentAuthUser();
  if (!isPlatformAdmin(user)) notFound();
  if (unlocked && !(await isAdminUnlocked(user.id))) redirect("/admin");
  return user;
}

// Bound to the specific user id so the unlock cookie can't be replayed by a
// different account, and never stores the password itself in the cookie.
function unlockToken(userId: string, password: string) {
  return createHash("sha256").update(`${userId}:${password}`).digest("hex");
}

function signUnlock(userId: string, expiresAt: number, password: string) {
  return createHmac("sha256", password).update(`halina-admin:${userId}:${expiresAt}`).digest("hex");
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
  const [expiry, token] = cookieValue.split(".");
  const expiresAt = Number(expiry);
  if (!token || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return false;
  return safeEqual(signUnlock(userId, expiresAt, password), token);
}

export async function unlockAdminSession(userId: string) {
  const password = process.env.ADMIN_PANEL_PASSWORD;
  if (!password) return;
  const store = await cookies();
  const expiresAt = Date.now() + UNLOCK_MAX_AGE_SECONDS * 1000;
  store.set(UNLOCK_COOKIE, `${expiresAt}.${signUnlock(userId, expiresAt, password)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: UNLOCK_MAX_AGE_SECONDS,
  });
}

export async function clearAdminSession() {
  const store = await cookies();
  store.set(UNLOCK_COOKIE, "", { path: "/admin", maxAge: 0 });
}
