import "server-only";
import { type PrismaClient, type WalkInAvailability } from "@/lib/generated/prisma/client";
import { isWithinServiceHours } from "@/lib/domain/restaurant-schedule";
import { broadcastRestaurantInvalidation } from "@/lib/realtime/invalidation";
import { customerServices } from "@/lib/restaurants/customer-access";
import { OperationsRepositoryError } from "@/lib/repositories/operations";
import { asRecord } from "./json-settings";

export async function createCustomerWaitlistEntry(client: PrismaClient, input: {
  slug: string;
  profileId: string;
  partyName: string;
  partySize: number;
  contact: string;
  notes?: string;
  promisedWaitMinutes: number;
  now?: Date;
}) {
  return client.$transaction(async (tx) => {
    // The same row lock orders customer writes against suspend and restore.
    const [restaurant] = await tx.$queryRaw<Array<{
      id: string; walkInAvailability: WalkInAvailability; timezone: string; operatingSettings: unknown;
    }>>`
      SELECT "id", "walkInAvailability", "timezone", "operatingSettings" FROM "Restaurant"
      WHERE "slug" = ${input.slug} AND "environment" = 'LIVE' AND "lifecycle" = 'PUBLISHED' AND "archivedAt" IS NULL
      FOR UPDATE
    `;
    if (!restaurant) throw new OperationsRepositoryError("VALIDATION", "This restaurant is no longer available.");
    if (!customerServices(restaurant.operatingSettings).waitlist) {
      throw new OperationsRepositoryError("VALIDATION", "This restaurant has turned off online waitlist requests.");
    }
    const now = input.now ?? new Date();
    if (!isWithinServiceHours({ ...asRecord(restaurant.operatingSettings), timezone: restaurant.timezone }, now)) {
      throw new OperationsRepositoryError("VALIDATION", "This restaurant is closed. Join the waitlist during opening hours.");
    }
    if (restaurant.walkInAvailability === "PAUSED") {
      throw new OperationsRepositoryError("VALIDATION", "This restaurant is not accepting new walk-ins right now.");
    }
    const existing = await tx.queueEntry.findFirst({
      where: { restaurantId: restaurant.id, createdById: input.profileId, source: "CUSTOMER", status: { in: ["WAITING", "CALLED"] } },
      select: { id: true },
    });
    if (existing) return existing;
    const last = await tx.queueEntry.aggregate({
      where: { restaurantId: restaurant.id, status: { in: ["WAITING", "CALLED"] } },
      _max: { position: true },
    });
    const entry = await tx.queueEntry.create({
      data: {
        restaurantId: restaurant.id, partyName: input.partyName, partySize: input.partySize,
        contact: input.contact || null, notes: input.notes || null, customerSeatingNote: input.notes || null,
        position: (last._max.position ?? -1) + 1, promisedWaitMinutes: input.promisedWaitMinutes,
        createdById: input.profileId, source: "CUSTOMER",
      },
      select: { id: true },
    });
    await tx.restaurant.update({ where: { id: restaurant.id }, data: { lastOperationalUpdateAt: now } });
    await broadcastRestaurantInvalidation(tx, {
      restaurantId: restaurant.id, restaurantSlug: input.slug, environment: "LIVE", entity: "queue", revision: now.toISOString(),
    });
    return entry;
  });
}
