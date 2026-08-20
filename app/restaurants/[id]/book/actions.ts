"use server";

import { redirect } from "next/navigation";
import { ensureProfile } from "@/lib/auth/profile";
import { validateReservationBooking } from "@/lib/customer/reservation-booking";
import { prisma } from "@/lib/prisma";
import { OperationsRepositoryError } from "@/lib/repositories/operations";
import { createCustomerReservation } from "@/lib/repositories/prisma/customer-reservations";
import { reportDataError } from "@/lib/server/data-error";
import { createClient } from "@/lib/supabase/server";

export type ReservationBookingState = {
  error?: string;
  success?: boolean;
};

export async function bookReservation(
  restaurantId: string,
  _previousState: ReservationBookingState,
  formData: FormData,
): Promise<ReservationBookingState> {
  const validation = validateReservationBooking(formData);
  if (!validation.ok) return { error: validation.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defense in depth — the page already gates on a logged-in user before
  // rendering this form, but a Server Action is independently invocable.
  if (!user) redirect("/login");

  try {
    const profile = await ensureProfile(user);
    await createCustomerReservation(prisma, {
      restaurantId,
      customerProfileId: profile.id,
      ...validation.input,
    });
  } catch (error) {
    if (error instanceof OperationsRepositoryError && error.code === "CONFLICT") {
      return { error: error.message };
    }
    const reference = reportDataError("customer-reservation", error);
    return {
      error: `We could not book this reservation right now. Please try again. Support reference: ${reference}`,
    };
  }

  return { success: true };
}
