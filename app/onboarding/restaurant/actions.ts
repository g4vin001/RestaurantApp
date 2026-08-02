"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { ensureProfile } from "@/lib/auth/profile";
import {
  createRestaurantSlug,
  validateRestaurantSetup,
} from "@/lib/auth/restaurant-onboarding";
import { prisma } from "@/lib/prisma";
import { createOwnedRestaurant } from "@/lib/repositories/prisma/owner-onboarding";
import { reportDataError } from "@/lib/server/data-error";
import { createClient } from "@/lib/supabase/server";

export type RestaurantSetupState = {
  error?: string;
};

export async function createRestaurantForOwner(
  _previousState: RestaurantSetupState,
  formData: FormData,
): Promise<RestaurantSetupState> {
  const validation = validateRestaurantSetup(formData);
  if (!validation.ok) return { error: validation.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/onboarding/restaurant");

  try {
    await ensureProfile(user);
    await createOwnedRestaurant(prisma, {
      profileId: user.id,
      name: validation.input.name,
      location: validation.input.location,
      slug: createRestaurantSlug(
        validation.input.name,
        randomUUID().replaceAll("-", "").slice(0, 8),
      ),
    });
  } catch (error) {
    const reference = reportDataError("owner-onboarding", error);
    return {
      error: `We could not create the restaurant right now. Please try again. Support reference: ${reference}`,
    };
  }

  redirect("/manager");
}
