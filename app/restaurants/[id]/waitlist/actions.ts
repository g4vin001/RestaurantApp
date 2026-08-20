"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureProfile } from "@/lib/auth/profile";
import { prisma } from "@/lib/prisma";
import { fetchPublicRestaurantBySlug } from "@/lib/repositories/prisma/public-restaurant-view";
import { createClient } from "@/lib/supabase/server";

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
  const profile = await ensureProfile(user);
  const partyName = String(formData.get("partyName") ?? "").trim();
  const partySize = Number(formData.get("partySize") ?? 0);
  const contact = String(formData.get("contact") ?? "").trim();
  if (partyName.length < 2 || partyName.length > 80)
    return { error: "Enter a party name between 2 and 80 characters." };
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 30)
    return { error: "Party size must be between 1 and 30." };

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, walkInAvailability: true },
  });
  if (!restaurant) return { error: "Restaurant not found." };
  if (restaurant.walkInAvailability === "PAUSED")
    return { error: "This restaurant is not accepting new walk-ins right now." };

  const existing = await prisma.queueEntry.findFirst({
    where: {
      restaurantId: restaurant.id,
      createdById: profile.id,
      source: "CUSTOMER",
      status: { in: ["WAITING", "CALLED"] },
    },
    select: { id: true },
  });
  if (existing) redirect("/my/waitlist");

  const publicView = await fetchPublicRestaurantBySlug(prisma, slug);
  const promisedWaitMinutes = Math.max(
    0,
    publicView?.estimatedWaitMinutes ?? 15,
  );
  const now = new Date();
  await prisma.$transaction([
    prisma.queueEntry.create({
      data: {
        restaurantId: restaurant.id,
        partyName,
        partySize,
        contact: contact || null,
        promisedWaitMinutes,
        createdById: profile.id,
        source: "CUSTOMER",
      },
    }),
    prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { lastOperationalUpdateAt: now },
    }),
  ]);
  revalidatePath(`/restaurants/${slug}`);
  revalidatePath("/");
  redirect("/my/waitlist");
}
