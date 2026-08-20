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

  await setFlash("message", "Password updated. You can now sign in with the new password.");
  redirect("/login");
}
