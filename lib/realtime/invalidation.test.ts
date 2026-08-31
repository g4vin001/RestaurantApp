import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { broadcastRestaurantInvalidation } from "./invalidation";

function createClient() {
  return {
    $executeRaw: vi.fn().mockResolvedValue(1),
  } as unknown as PrismaClient;
}

describe("restaurant invalidation broadcasts", () => {
  it("uses a non-row-returning query for private TEST invalidations", async () => {
    const client = createClient();

    await broadcastRestaurantInvalidation(client, {
      restaurantId: "restaurant-1",
      restaurantSlug: "preview-lab",
      environment: "TEST",
      entity: "queue",
      revision: "7",
    });

    expect(client.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("also publishes a privacy-safe public invalidation for LIVE restaurants", async () => {
    const client = createClient();

    await broadcastRestaurantInvalidation(client, {
      restaurantId: "restaurant-1",
      restaurantSlug: "halina-live",
      environment: "LIVE",
      entity: "table",
      revision: "8",
    });

    expect(client.$executeRaw).toHaveBeenCalledTimes(2);
  });
});
