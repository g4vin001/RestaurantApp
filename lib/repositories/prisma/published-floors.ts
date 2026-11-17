import "server-only";

import type { Prisma } from "@/lib/generated/prisma/client";

export async function loadPublishedFloors(
  client: Pick<Prisma.TransactionClient, "floorPlan">,
  restaurantId: string,
) {
  const plans = await client.floorPlan.findMany({
    where: { restaurantId, archivedAt: null, activeVersionId: { not: null } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      activeVersion: {
        select: {
          elements: {
            where: { diningTableId: { not: null } },
            select: { diningTableId: true },
          },
        },
      },
    },
  });
  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    tableIds: (plan.activeVersion?.elements ?? []).flatMap(({ diningTableId }) =>
      diningTableId ? [diningTableId] : [],
    ),
  }));
}
