"use server";

import { redirect } from "next/navigation";
import { getActiveManagerMembership } from "@/lib/auth/manager-membership";
import { ensureProfile } from "@/lib/auth/profile";
import { safeInternalRedirect } from "@/lib/auth/safe-redirect";
import { setFlash } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";

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

  await ensureProfile(data.user);
  const membership = await getActiveManagerMembership(data.user.id);
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

  await ensureProfile(data.user, displayName);

  await setFlash("message", "Check your email to confirm your account.");
  redirect("/login");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
