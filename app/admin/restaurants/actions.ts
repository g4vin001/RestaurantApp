"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import type { ReviewFormState } from "@/components/review/ReviewForms";
import { prisma } from "@/lib/prisma";
import { reviewRestaurantApplication } from "@/lib/repositories/prisma/restaurant-applications";
import { reviewRestaurantPublication } from "@/lib/repositories/prisma/restaurant-publication";
import { approvalChecks, formMessage, formRevision, RestaurantReviewError, reviewUuid } from "@/lib/restaurants/review";
import { notifyRestaurantReview } from "@/lib/restaurants/review-email";
import { reviewError } from "@/lib/restaurants/review-errors";
import { setReviewNotice } from "@/lib/restaurants/review-notice";

export async function decideApplication(id: string, _state: ReviewFormState, form: FormData): Promise<ReviewFormState> {
  const actor = await requirePlatformAdmin();
  let result: Awaited<ReturnType<typeof reviewRestaurantApplication>>;
  const action = form.get("decision");
  try {
    if (!reviewUuid(id)) throw new RestaurantReviewError("Application unavailable.");
    const revision = formRevision(form.get("revision"));
    if (action === "APPROVED") {
      const checks = Object.fromEntries(approvalChecks.map(([key]) => [key, form.get(key) === "on"])) as
        Record<(typeof approvalChecks)[number][0], boolean>;
      result = await reviewRestaurantApplication(prisma, { actor, id, revision, decision: { action, checks } });
    } else if (action === "DECLINED" || action === "INFORMATION_REQUESTED" || action === "NOTE_ADDED") {
      result = await reviewRestaurantApplication(prisma, {
        actor, id, revision, decision: { action, message: formMessage(form.get("message")) },
      });
    } else {
      throw new RestaurantReviewError("Select a review decision.");
    }
  } catch (error) {
    return { error: reviewError("restaurant-application-decision", error, "We could not save this decision. Try again.") };
  }
  revalidatePath("/admin/restaurants");
  revalidatePath(`/admin/restaurants/applications/${id}`);
  revalidatePath("/onboarding/restaurant");
  const message = action === "NOTE_ADDED" ? "Internal note saved."
    : `Decision saved. ${await notifyRestaurantReview(result, "/onboarding/restaurant")}`;
  const detailPath = `/admin/restaurants/applications/${id}`;
  await setReviewNotice(detailPath, message);
  redirect(detailPath);
}

export async function decidePublication(id: string, _state: ReviewFormState, form: FormData): Promise<ReviewFormState> {
  const actor = await requirePlatformAdmin();
  let result: Awaited<ReturnType<typeof reviewRestaurantPublication>>;
  try {
    if (!reviewUuid(id)) throw new RestaurantReviewError("Restaurant unavailable.");
    const action = form.get("decision");
    const revision = formRevision(form.get("revision"));
    if (action === "PUBLISHED") {
      result = await reviewRestaurantPublication(prisma, actor, id, revision, { action });
    } else if (action === "PUBLICATION_RETURNED" || action === "SUSPENDED" || action === "RESTORED") {
      result = await reviewRestaurantPublication(prisma, actor, id, revision, { action, message: formMessage(form.get("message")) });
    } else {
      throw new RestaurantReviewError("Select a publication decision.");
    }
  } catch (error) {
    return { error: reviewError("restaurant-publication-decision", error, "We could not save this decision. Try again.") };
  }
  revalidatePath("/");
  revalidatePath(`/restaurants/${result.slug}`);
  revalidatePath("/onboarding/restaurant");
  revalidatePath("/manager/setup");
  revalidatePath("/admin/restaurants");
  revalidatePath(`/admin/restaurants/listings/${id}`);
  const message = `Decision saved. ${await notifyRestaurantReview(result, "/manager/setup")}`;
  const listingPath = `/admin/restaurants/listings/${id}`;
  await setReviewNotice(listingPath, message);
  redirect(listingPath);
}
