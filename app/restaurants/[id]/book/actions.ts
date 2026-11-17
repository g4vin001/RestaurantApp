"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ensureProfile } from "@/lib/auth/profile";
import { validateReservationBooking } from "@/lib/customer/reservation-booking";
import { readReservationLeadMinutes } from "@/lib/domain/restaurant-schedule";
import { prisma } from "@/lib/prisma";
import { OperationsRepositoryError } from "@/lib/repositories/operations";
import { createCustomerReservation } from "@/lib/repositories/prisma/customer-reservations";
import { broadcastRestaurantInvalidation } from "@/lib/realtime/invalidation";
import { asRecord } from "@/lib/repositories/prisma/json-settings";
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defense in depth — the page already gates on a logged-in user before
  // rendering this form, but a Server Action is independently invocable.
  if (!user) redirect("/login");

  try {
    const restaurant = await prisma.restaurant.findFirst({
      where: { id: restaurantId, environment: "LIVE", archivedAt: null },
      select: { timezone: true, slug: true, operatingSettings: true },
    });
    if (!restaurant) return { error: "This restaurant is no longer available." };
    const requestedAt = new Date();
    const validation = validateReservationBooking(
      formData, requestedAt, restaurant.timezone, readReservationLeadMinutes(asRecord(restaurant.operatingSettings)),
    );
    if (!validation.ok) return { error: validation.error };
    const profile = await ensureProfile(user);
    const booking = await createCustomerReservation(prisma, {
      restaurantId,
      customerProfileId: profile.id,
      requestedAt,
      ...validation.input,
    });
    revalidatePath("/reservations");
    revalidatePath("/ops");
    revalidatePath("/manager/queue");
    await broadcastRestaurantInvalidation(prisma, {
      restaurantId,
      restaurantSlug: restaurant.slug,
      environment: "LIVE",
      entity: "reservation",
      revision: booking.reservationId,
    }).catch((error) => reportDataError("customer-reservation-invalidation", error));
  } catch (error) {
    if (error instanceof OperationsRepositoryError && (error.code === "CONFLICT" || error.code === "VALIDATION")) {
      return { error: error.message };
    }
    const reference = reportDataError("customer-reservation", error);
    return {
      error: `We could not book this reservation right now. Please try again. Support reference: ${reference}`,
    };
  }

  return { success: true };
}
