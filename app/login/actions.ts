"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveManagerMembership } from "@/lib/auth/manager-membership";
import { ensureProfile } from "@/lib/auth/profile";
import { safeInternalRedirect } from "@/lib/auth/safe-redirect";
import { setFlash } from "@/lib/flash";
import { reportDataError } from "@/lib/server/data-error";
import { createClient } from "@/lib/supabase/server";

async function reportLoginDataFailure(context: string, error: unknown) {
  const reference = reportDataError(context, error);
  await setFlash(
    "error",
    `Halina could not finish loading your account from the restaurant database. Please try again. Support reference: ${reference}`,
  );
}

function normalizeOrigin(value: string | undefined) {
  if (!value) return null;
  const candidate = value.startsWith("http") ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    return url.origin;
  } catch {
    return null;
  }
}

async function authOrigin() {
  const configured =
    normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL) ??
    normalizeOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    normalizeOrigin(process.env.NEXT_PUBLIC_VERCEL_URL);
  if (configured) return configured;

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) return "http://localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${protocol}://${host}`;
}

function loginRedirect(redirectTo: string) {
  return redirectTo
    ? `/login?redirectTo=${encodeURIComponent(redirectTo)}`
    : "/login";
}

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const redirectTo = safeInternalRedirect(formData.get("redirectTo"), "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    await setFlash("error", error.message);
    redirect(loginRedirect(redirectTo));
  }

  let membership: Awaited<ReturnType<typeof getActiveManagerMembership>>;
  try {
    await ensureProfile(data.user);
    membership = await getActiveManagerMembership(data.user.id);
  } catch (databaseError) {
    await reportLoginDataFailure("login-profile", databaseError);
    redirect(loginRedirect(redirectTo));
  }
  redirect(redirectTo || (membership ? "/manager" : "/"));
}

export async function signup(formData: FormData) {
  const displayName = formData.get("displayName") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;
  const redirectTo = safeInternalRedirect(formData.get("redirectTo"), "/");
  if (password !== confirmPassword) {
    await setFlash("error", "Passwords do not match.");
    redirect(loginRedirect(redirectTo === "/" ? "" : redirectTo));
  }

  const origin = await authOrigin();
  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("next", redirectTo);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName.trim() },
      emailRedirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    await setFlash("error", error.message);
    redirect(loginRedirect(redirectTo === "/" ? "" : redirectTo));
  }

  if (!data.user || data.user.identities?.length === 0) {
    await setFlash(
      "error",
      "An account with this email already exists. Try logging in or resetting the password.",
    );
    redirect(loginRedirect(redirectTo === "/" ? "" : redirectTo));
  }

  try {
    await ensureProfile(data.user, displayName);
  } catch (databaseError) {
    await reportLoginDataFailure("signup-profile", databaseError);
    redirect(loginRedirect(redirectTo === "/" ? "" : redirectTo));
  }

  await setFlash("message", "Check your email to confirm your account.");
  redirect(loginRedirect(redirectTo === "/" ? "" : redirectTo));
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    await setFlash("error", "Enter your email first, then choose Forgot password.");
    redirect("/login");
  }

  const origin = await authOrigin();
  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("next", "/reset-password");

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl.toString(),
  });

  if (error) {
    await setFlash("error", error.message);
  } else {
    await setFlash(
      "message",
      "If that account exists, a password reset email has been sent. Open the newest email only.",
    );
  }
  redirect("/login");
}

export async function resendConfirmation(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const redirectTo = safeInternalRedirect(formData.get("redirectTo"), "/");
  if (!email) {
    await setFlash("error", "Enter your email first, then choose Resend confirmation.");
    redirect(loginRedirect(redirectTo === "/" ? "" : redirectTo));
  }

  const origin = await authOrigin();
  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("next", redirectTo);

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: callbackUrl.toString() },
  });

  if (error) {
    await setFlash("error", error.message);
  } else {
    await setFlash("message", "A fresh confirmation email has been sent. Use the newest link only.");
  }
  redirect(loginRedirect(redirectTo === "/" ? "" : redirectTo));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
