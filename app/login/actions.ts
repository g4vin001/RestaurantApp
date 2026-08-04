"use server";

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
  if (password !== confirmPassword) {
    await setFlash("error", "Passwords do not match.");
    redirect("/login");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName.trim() },
    },
  });

  if (error) {
    await setFlash("error", error.message);
    redirect("/login");
  }

  // An empty `identities` array signals that no new account was actually created.
  if (!data.user || data.user.identities?.length === 0) {
    await setFlash(
      "error",
      "An account with this email already exists. Try logging in instead.",
    );
    redirect("/login");
  }

  try {
    await ensureProfile(data.user, displayName);
  } catch (databaseError) {
    await reportLoginDataFailure("signup-profile", databaseError);
    redirect("/login");
  }

  await setFlash("message", "Check your email to confirm your account.");
  redirect("/login");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
