"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { canTransitionTable } from "@/lib/domain/transitions";
import type { TableStatus } from "@/lib/domain/types";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { getActiveStaffAccess } from "@/lib/staff/access";

async function requireStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("UNAUTHORIZED");
  const access = await getActiveStaffAccess(user.id);
  if (!access || !access.staffRecord) throw new Error("FORBIDDEN");
  return { user, access };
}

function revalidateRestaurant(slug: string) {
  revalidatePath("/ops");
  revalidatePath(`/restaurants/${slug}`);
  revalidatePath("/");
}

export async function transitionStaffTable(formData: FormData) {
  const { user, access } = await requireStaff();
  const tableId = String(formData.get("tableId") ?? "");
  const toStatus = String(formData.get("status") ?? "") as TableStatus;
  const partySize = Number(formData.get("partySize") ?? 0);
  const allowed: TableStatus[] = [
    "AVAILABLE",
    "HELD",
    "RESERVED",
    "OCCUPIED",
    "CLEANING",
    "OUT_OF_SERVICE",
  ];
  if (!allowed.includes(toStatus)) return;

  await prisma.$transaction(async (tx) => {
    const table = await tx.diningTable.findFirst({
      where: {
        id: tableId,
        restaurantId: access.restaurantId,
        active: true,
        archivedAt: null,
      },
    });
    if (!table || !canTransitionTable(table.currentStatus, toStatus)) return;
    if (
      toStatus === "OCCUPIED" &&
      (!Number.isInteger(partySize) || partySize < 1 || partySize > table.capacity)
    )
      return;

    const changed = await tx.diningTable.updateMany({
      where: {
        id: table.id,
        restaurantId: access.restaurantId,
        currentStatus: table.currentStatus,
        statusRevision: table.statusRevision,
      },
      data: {
        currentStatus: toStatus,
        statusRevision: { increment: 1 },
      },
    });
    if (changed.count !== 1) throw new Error("CONFLICT");
    const now = new Date();
    await tx.tableStatusEvent.create({
      data: {
        restaurantId: access.restaurantId,
        diningTableId: table.id,
        fromStatus: table.currentStatus,
        toStatus,
        actorProfileId: user.id,
        sourceCommandId: randomUUID(),
        reason: "Restricted staff operation",
        occurredAt: now,
      },
    });

    if (toStatus === "OCCUPIED") {
      await tx.diningSession.create({
        data: {
          restaurantId: access.restaurantId,
          diningTableId: table.id,
          partySize,
          seatedAt: now,
        },
      });
    } else if (
      table.currentStatus === "OCCUPIED" &&
      toStatus === "CLEANING"
    ) {
      const session = await tx.diningSession.findFirst({
        where: {
          restaurantId: access.restaurantId,
          diningTableId: table.id,
          status: "ACTIVE",
        },
        orderBy: { seatedAt: "desc" },
      });
      if (session)
        await tx.diningSession.update({
          where: { id: session.id },
          data: {
            status: "CLEANING",
            clearedAt: now,
            cleaningStartedAt: now,
          },
        });
    } else if (
      table.currentStatus === "CLEANING" &&
      toStatus === "AVAILABLE"
    ) {
      const session = await tx.diningSession.findFirst({
        where: {
          restaurantId: access.restaurantId,
          diningTableId: table.id,
          status: "CLEANING",
        },
        orderBy: { seatedAt: "desc" },
      });
      if (session)
        await tx.diningSession.update({
          where: { id: session.id },
          data: {
            status: "COMPLETED",
            availableAt: now,
            completedAt: now,
          },
        });
    }
    await tx.restaurant.update({
      where: { id: access.restaurantId },
      data: { lastOperationalUpdateAt: now },
    });
  });
  revalidateRestaurant(access.restaurant.slug);
}

export async function updateStaffQueueStatus(formData: FormData) {
  const { access } = await requireStaff();
  if (access.staffRecord?.permissionPreset !== "HOST") return;
  const queueId = String(formData.get("queueId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["CALLED", "CANCELLED", "NO_SHOW"].includes(status)) return;
  const now = new Date();
  const data =
    status === "CALLED"
      ? {
          status: "CALLED" as const,
          calledAt: now,
          revision: { increment: 1 },
        }
      : status === "CANCELLED"
        ? {
            status: "CANCELLED" as const,
            cancelledAt: now,
            revision: { increment: 1 },
          }
        : {
            status: "NO_SHOW" as const,
            noShowAt: now,
            revision: { increment: 1 },
          };

  await prisma.$transaction(async (tx) => {
    const changed = await tx.queueEntry.updateMany({
      where: {
        id: queueId,
        restaurantId: access.restaurantId,
        status: { in: ["WAITING", "CALLED"] },
      },
      data,
    });
    if (changed.count) {
      await tx.restaurant.update({
        where: { id: access.restaurantId },
        data: { lastOperationalUpdateAt: now },
      });
    }
  });
  revalidateRestaurant(access.restaurant.slug);
}
