import "server-only";

import type { PrismaClient } from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";

export type InvalidationEntity =
  | "restaurant"
  | "floor"
  | "table"
  | "queue"
  | "reservation"
  | "staff";

export async function broadcastRestaurantInvalidation(
  client: PrismaClient,
  input: {
    restaurantId: string;
    restaurantSlug: string;
    environment: "LIVE" | "TEST";
    entity: InvalidationEntity;
    revision: string;
  },
) {
  const payload = {
    restaurantId: input.restaurantId,
    entity: input.entity,
    revision: input.revision,
    timestamp: new Date().toISOString(),
  };

  await client.$queryRaw(
    Prisma.sql`SELECT realtime.send(
      ${JSON.stringify(payload)}::jsonb,
      'invalidated',
      ${`restaurant:${input.restaurantId}`},
      true
    )`,
  );

  if (input.environment === "LIVE") {
    await client.$queryRaw(
      Prisma.sql`SELECT realtime.send(
        ${JSON.stringify({
          restaurantSlug: input.restaurantSlug,
          revision: input.revision,
          timestamp: payload.timestamp,
        })}::jsonb,
        'invalidated',
        ${`public-restaurant:${input.restaurantSlug}`},
        false
      )`,
    );
  }
}
