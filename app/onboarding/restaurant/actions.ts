"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ReviewFormState } from "@/components/review/ReviewForms";
import { getCurrentAuthUser } from "@/lib/auth/current-identity";
import { ensureProfile } from "@/lib/auth/profile";
import { readApplicationEvidence, validateRestaurantApplication } from "@/lib/auth/restaurant-onboarding";
import { prisma } from "@/lib/prisma";
import { formMessage, formRevision, RestaurantReviewError, reviewUuid } from "@/lib/restaurants/review";
import { reviewError } from "@/lib/restaurants/review-errors";
import { submitRestaurantApplication } from "@/lib/repositories/prisma/restaurant-applications";

export async function submitRestaurantApplicationAction(_state: ReviewFormState, form: FormData): Promise<ReviewFormState> {
  const user = await getCurrentAuthUser();
  if (!user) redirect("/login?redirectTo=/onboarding/restaurant");
  if (!user.email || !user.email_confirmed_at || user.is_anonymous) {
    return { error: "Verify your Halina account email before submitting a restaurant application." };
  }

  try {
    const previous = form.get("applicationId");
    if (previous !== null && !reviewUuid(previous)) throw new RestaurantReviewError("Refresh the application before submitting.");
    const response = form.get("response");
    const details = validateRestaurantApplication(form);
    const evidence = await readApplicationEvidence(form.get("evidence"), previous === null);
    await ensureProfile(user);
    await submitRestaurantApplication(prisma, {
      applicant: { id: user.id, email: user.email, emailVerifiedAt: new Date(user.email_confirmed_at) },
      previous: previous ? { id: previous, revision: formRevision(form.get("revision")) } : undefined,
      details, evidence, response: response === null ? undefined : formMessage(response),
    });
  } catch (error) {
    return { error: reviewError("restaurant-application-submit", error, "We could not submit your application. Please try again.") };
  }
  revalidatePath("/onboarding/restaurant");
  revalidatePath("/admin/restaurants");
  return { message: "Application submitted for review." };
}
