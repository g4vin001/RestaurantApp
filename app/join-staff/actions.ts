"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ensureProfile } from "@/lib/auth/profile";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { hashRequestAddress, normalizeStaffInviteCode } from "@/lib/staff/invitations";
import { redeemStaffAccess } from "@/lib/staff/redeem";

export async function redeemStaffCode(formData: FormData) {
  const code = normalizeStaffInviteCode(String(formData.get("code") ?? ""));
  if (!code) redirect("/join-staff?error=Enter%20the%20staff%20code.");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(`/join-staff?code=${code}`)}`);
  const profile = await ensureProfile(user);
  const requestHeaders = await headers();
  const address = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? requestHeaders.get("x-real-ip") ?? "unknown";
  const result = await redeemStaffAccess(prisma, {
    profileId: profile.id,
    verifiedEmail: user.email_confirmed_at ? (user.email ?? null) : null,
    ipHash: hashRequestAddress(address),
    code,
  });
  if (!result.ok) redirect(`/join-staff?error=${encodeURIComponent(result.error)}`);
  redirect("/ops");
}
