import "server-only";

import { cookies } from "next/headers";

// Remembers which email just failed to log in because it isn't confirmed, so
// the login page can offer a one-click resend without asking for it again.
// Server-only (httpOnly) and kept out of the URL, where it would end up in
// browser history and logs.
const COOKIE_NAME = "pending_confirmation_email";
const MAX_AGE_SECONDS = 10 * 60;

export async function rememberUnconfirmedEmail(email: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, email, {
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function forgetUnconfirmedEmail() {
  const store = await cookies();
  store.delete({ name: COOKIE_NAME, path: "/" });
}

export async function readUnconfirmedEmail() {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value;
}
