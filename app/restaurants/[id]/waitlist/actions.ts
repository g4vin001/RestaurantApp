"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureProfile } from "@/lib/auth/profile";
import { prisma } from "@/lib/prisma";
import { fetchPublicRestaurantBySlug } from "@/lib/repositories/prisma/public-restaurant-view";
import { createClient } from "@/lib/supabase/server";
import { createCustomerWaitlistEntry } from "@/lib/repositories/prisma/customer-waitlist";
import { OperationsRepositoryError } from "@/lib/repositories/operations";
import { reportDataError } from "@/lib/server/data-error";

export type WaitlistJoinState = { error?: string };

export async function joinCustomerWaitlist(
  slug: string,
  _previousState: WaitlistJoinState,
  formData: FormData,
): Promise<WaitlistJoinState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user)
    redirect(
      `/login?redirectTo=${encodeURIComponent(`/restaurants/${slug}/waitlist`)}`,
    );
  const partyName = String(formData.get("partyName") ?? "").trim();
  const partySize = Number(formData.get("partySize") ?? 0);
  const contact = String(formData.get("contact") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (partyName.length < 2 || partyName.length > 80)
    return { error: "Enter a party name between 2 and 80 characters." };
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 30)
    return { error: "Party size must be between 1 and 30." };
  if (contact.length > 120 || /\x00/.test(partyName + contact))
    return { error: "Enter a valid name and contact of at most 120 characters." };
  if (notes.length > 500 || notes.includes("\0"))
    return { error: "Keep notes under 500 characters." };

  try {
    const profile = await ensureProfile(user);
    const publicView = await fetchPublicRestaurantBySlug(prisma, slug);
    if (!publicView) return { error: "This restaurant is no longer available." };
    await createCustomerWaitlistEntry(prisma, {
      slug, profileId: profile.id, partyName, partySize, contact, notes,
      promisedWaitMinutes: Math.max(0, publicView.estimatedWaitMinutes ?? 15),
    });
  } catch (error) {
    if (error instanceof OperationsRepositoryError && error.code === "VALIDATION") return { error: error.message };
    const reference = reportDataError("customer-waitlist", error);
    return { error: `We could not join the waitlist. Try again. Support reference: ${reference}` };
  }
  revalidatePath(`/restaurants/${slug}`);
  revalidatePath("/");
  redirect("/my/waitlist");
}
