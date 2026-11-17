"use server";

import { redirect } from "next/navigation";
import { ensureProfile } from "@/lib/auth/profile";
import { validateRestaurantApplication } from "@/lib/auth/restaurant-onboarding";
import { prisma } from "@/lib/prisma";
import { submitRestaurantApplication } from "@/lib/repositories/prisma/restaurant-applications";
import { reportDataError } from "@/lib/server/data-error";
import { createClient } from "@/lib/supabase/server";

export type RestaurantSetupState = {
  error?: string;
};

export async function applyToListRestaurant(
  _previousState: RestaurantSetupState,
  formData: FormData,
): Promise<RestaurantSetupState> {
  const validation = validateRestaurantApplication(formData);
  if (!validation.ok) return { error: validation.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/onboarding/restaurant");
  if (!user.email_confirmed_at) return { error: "Confirm your Halina email before applying." };

  try {
    await ensureProfile(user);
    await submitRestaurantApplication(prisma, user.id, validation.input);
  } catch (error) {
    const reference = reportDataError("owner-onboarding", error);
    return {
      error: "We could not submit the application right now. Please try again. Support reference: " + reference,
    };
  }

  redirect("/onboarding/restaurant");
}
