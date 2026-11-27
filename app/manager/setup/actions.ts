"use server";

import { revalidatePath } from "next/cache";
import type { ReviewFormState } from "@/components/review/ReviewForms";
import { getCurrentAuthUser } from "@/lib/auth/current-identity";
import { getActiveManagerMembership } from "@/lib/auth/manager-membership";
import { prisma } from "@/lib/prisma";
import { updateOwnerSetup } from "@/lib/repositories/prisma/restaurant-publication";
import { RestaurantReviewError } from "@/lib/restaurants/review";
import { reviewError } from "@/lib/restaurants/review-errors";

export async function saveRestaurantSetup(_state: ReviewFormState, form: FormData): Promise<ReviewFormState> {
  const user = await getCurrentAuthUser();
  if (!user?.email || !user.email_confirmed_at || user.is_anonymous) return { error: "Sign in with your verified owner account before making changes." };
  const action = form.get("setupAction");
  try {
    const membership = await getActiveManagerMembership(user.id);
    if (membership?.role !== "OWNER") throw new RestaurantReviewError("Only the restaurant owner can make these changes.");
    const actor = { id: user.id, email: user.email };
    if (action === "SERVICES") {
      await updateOwnerSetup(prisma, actor, membership.restaurantId, {
        action, reservations: form.has("configureReservations") ? form.get("reservations") === "on" : undefined, waitlist: form.get("waitlist") === "on",
      });
      revalidatePath(`/restaurants/${membership.restaurant.slug}`);
    } else if (action === "PUBLICATION_REQUESTED") {
      await updateOwnerSetup(prisma, actor, membership.restaurantId, { action });
    } else {
      throw new RestaurantReviewError("Select a setup action.");
    }
  } catch (error) {
    return { error: reviewError("restaurant-owner-setup", error, "We could not save your changes. Try again.") };
  }
  revalidatePath("/manager/setup");
  revalidatePath("/admin/restaurants");
  revalidatePath("/onboarding/restaurant");
  return { message: action === "PUBLICATION_REQUESTED" ? "Publication request submitted for review." : "Settings saved." };
}
