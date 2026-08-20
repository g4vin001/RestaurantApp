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

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const redirectTo = safeInternalRedirect(formData.get("redirectTo"), "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    await setFlash("error", error.message);
    redirect(
      redirectTo
        ? `/login?redirectTo=${encodeURIComponent(redirectTo)}`
        : "/login",
    );
  }

  let membership: Awaited<ReturnType<typeof getActiveManagerMembership>>;
  try {
    await ensureProfile(data.user);
    membership = await getActiveManagerMembership(data.user.id);
  } catch (databaseError) {
    await reportLoginDataFailure("login-profile", databaseError);
    redirect(
      redirectTo
        ? `/login?redirectTo=${encodeURIComponent(redirectTo)}`
        : "/login",
    );
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
    redirect(
      redirectTo === "/"
        ? "/login"
        : `/login?redirectTo=${encodeURIComponent(redirectTo)}`,
    );
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
    redirect(
      redirectTo === "/"
        ? "/login"
        : `/login?redirectTo=${encodeURIComponent(redirectTo)}`,
    );
  }

  // An empty `identities` array signals that no new account was actually created.
  if (!data.user || data.user.identities?.length === 0) {
    await setFlash(
      "error",
      "An account with this email already exists. Try logging in instead.",
    );
    redirect(
      redirectTo === "/"
        ? "/login"
        : `/login?redirectTo=${encodeURIComponent(redirectTo)}`,
    );
  }

  try {
    await ensureProfile(data.user, displayName);
  } catch (databaseError) {
    await reportLoginDataFailure("signup-profile", databaseError);
    redirect(
      redirectTo === "/"
        ? "/login"
        : `/login?redirectTo=${encodeURIComponent(redirectTo)}`,
    );
  }

  await setFlash("message", "Check your email to confirm your account.");
  redirect(
    redirectTo === "/"
      ? "/login"
      : `/login?redirectTo=${encodeURIComponent(redirectTo)}`,
  );
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
