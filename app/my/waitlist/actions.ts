"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { broadcastRestaurantInvalidation } from "@/lib/realtime/invalidation";
import { reportDataError } from "@/lib/server/data-error";

export async function cancelMyWaitlist(_state: { error: string }, formData: FormData): Promise<{ error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again to leave the waitlist." };
  const queueId = String(formData.get("queueId") ?? "");
  try {
    const result = await prisma.$transaction(async (tx) => {
      const entry = await tx.queueEntry.findFirst({
        where: {
          id: queueId, createdById: user.id, source: "CUSTOMER",
          status: { in: ["WAITING", "CALLED"] },
          restaurant: { environment: "LIVE", archivedAt: null },
        },
        select: { id: true, restaurantId: true, restaurant: { select: { slug: true } } },
      });
      if (!entry) return null;
      const now = new Date();
      // Recheck after any lock wait: cancellation cannot overwrite seating.
      const updated = await tx.queueEntry.updateMany({
        where: { id: entry.id, createdById: user.id, source: "CUSTOMER", status: { in: ["WAITING", "CALLED"] } },
        data: { status: "CANCELLED", cancelledAt: now, revision: { increment: 1 } },
      });
      if (!updated.count) return null;
      await tx.restaurant.update({ where: { id: entry.restaurantId }, data: { lastOperationalUpdateAt: now } });
      await broadcastRestaurantInvalidation(tx, {
        restaurantId: entry.restaurantId, restaurantSlug: entry.restaurant.slug,
        environment: "LIVE", entity: "queue", revision: now.toISOString(),
      });
      return { slug: entry.restaurant.slug };
    });
    revalidatePath("/my/waitlist");
    if (!result) return { error: "Your party's status changed. Check the latest status before trying again." };
    revalidatePath(`/restaurants/${result.slug}`);
    revalidatePath("/");
    return { error: "" };
  } catch (error) {
    reportDataError("customer-waitlist-cancel", error);
    return { error: "We couldn't confirm the cancellation. Refresh your status before trying again." };
  }
}
