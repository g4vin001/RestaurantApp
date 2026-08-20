"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export async function cancelMyWaitlist(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const queueId = String(formData.get("queueId") ?? "");
  const now = new Date();
  const entry = await prisma.queueEntry.findFirst({
    where: { id: queueId, createdById: user.id, source: "CUSTOMER", status: { in: ["WAITING", "CALLED"] } },
    select: { id: true, restaurantId: true },
  });
  if (!entry) return;
  await prisma.$transaction([
    prisma.queueEntry.update({ where: { id: entry.id }, data: { status: "CANCELLED", cancelledAt: now, revision: { increment: 1 } } }),
    prisma.restaurant.update({ where: { id: entry.restaurantId }, data: { lastOperationalUpdateAt: now } }),
  ]);
  revalidatePath("/my/waitlist");
}
