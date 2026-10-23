"use server";

import { redirect } from "next/navigation";
import { setFlash } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 6) {
    await setFlash("error", "Password must be at least 6 characters.");
    redirect("/reset-password");
  }

  if (password !== confirmPassword) {
    await setFlash("error", "Passwords do not match.");
    redirect("/reset-password");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    await setFlash("error", error.message);
    redirect("/reset-password");
  }

  // The reset link signed the user in only to change the password. Sign out so
  // they finish on the login page and prove the new password works.
  await supabase.auth.signOut();
  await setFlash("message", "Password updated. Log in with your new password.");
  redirect("/login");
}
