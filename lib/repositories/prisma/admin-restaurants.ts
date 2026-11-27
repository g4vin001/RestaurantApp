import "server-only";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { assertNoLiveListing, lockBusinessIdentity, restaurantBusinessKey } from "./restaurant-business-identity";
import { RestaurantReviewError } from "@/lib/restaurants/review";

export type CreateRestaurantAsAdminInput = {
  ownerId: string;
  name: string;
  location: string;
  cuisineType?: string;
  slug: string;
  environment?: "LIVE" | "TEST";
};

export async function createRestaurantAsAdmin(
  client: PrismaClient,
  input: CreateRestaurantAsAdminInput,
) {
  return client.$transaction(async (tx) => {
    if (input.environment !== "TEST") {
      const key = await restaurantBusinessKey(tx, input.name, input.location);
      await lockBusinessIdentity(tx, key);
      await assertNoLiveListing(tx, key);
    }
    return provisionRestaurant(tx, input);
  });
}

export async function provisionRestaurant(
  transaction: Prisma.TransactionClient,
  input: CreateRestaurantAsAdminInput,
) {
  const restaurant = await transaction.restaurant.create({
        data: {
          name: input.name,
          location: input.location,
          cuisineType: input.cuisineType,
          slug: input.slug,
          environment: input.environment ?? "LIVE",
          lifecycle: "SETUP",
          timezone: "Asia/Manila",
          locale: "en-PH",
          operatingSettings: {
            opensAtHour: 10,
            closesAtHour: 22,
            cleaningTargetMinutes: 12,
            reservationDurationMinutes: 90,
          },
          memberships: {
            create: {
              profileId: input.ownerId,
              role: "OWNER",
            },
          },
          floorPlans: {
            create: {
              name: "Main floor",
              logicalWidth: 1600,
              logicalHeight: 1000,
              draftSnapshot: {
                elements: [],
                logicalWidth: 1600,
                logicalHeight: 1000,
              },
            },
          },
          staffRoles: {
            create: [
              { name: "Floor Staff", presetKey: "FLOOR_STAFF", permissions: ["VIEW_LIVE_FLOOR", "CHANGE_TABLE_STATUS", "VIEW_QUEUE"] },
              { name: "Host", presetKey: "HOST", permissions: ["VIEW_LIVE_FLOOR", "CHANGE_TABLE_STATUS", "VIEW_QUEUE", "VIEW_CONTACT_DETAILS", "MANAGE_QUEUE", "SEAT_PARTIES"] },
              { name: "Shift Lead", presetKey: "SHIFT_LEAD", permissions: ["VIEW_LIVE_FLOOR", "CHANGE_TABLE_STATUS", "VIEW_QUEUE", "VIEW_CONTACT_DETAILS", "MANAGE_QUEUE", "SEAT_PARTIES", "CORRECT_RECENT_ACTION"] },
            ],
          },
        },
        include: {
          memberships: {
            where: { profileId: input.ownerId },
            select: { id: true },
          },
        },
      });

  return {
    restaurantId: restaurant.id,
    membershipId: restaurant.memberships[0].id,
  };
}

export async function setRestaurantArchivedAsAdmin(
  client: PrismaClient,
  input: { restaurantId: string; actorProfileId: string; archived: boolean; expectedName: string; reason: string; ipHash?: string },
) {
  return client.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "Restaurant" WHERE "id" = ${input.restaurantId}::uuid FOR UPDATE`;
    const restaurant = await transaction.restaurant.findUnique({
      where: { id: input.restaurantId },
      select: { id: true, name: true, location: true, environment: true, archivedAt: true },
    });
    if (!restaurant) throw new RestaurantReviewError("That restaurant no longer exists.");
    if (restaurant.name !== input.expectedName) throw new RestaurantReviewError(`Type "${restaurant.name}" exactly to confirm.`);
    if (input.archived === Boolean(restaurant.archivedAt)) throw new RestaurantReviewError("This restaurant already has the requested archive status.");
    if (!input.archived && restaurant.environment === "LIVE") {
      const key = await restaurantBusinessKey(transaction, restaurant.name, restaurant.location);
      await lockBusinessIdentity(transaction, key);
      await assertNoLiveListing(transaction, key, restaurant.id);
    }
    const archivedAt = input.archived ? new Date() : null;
    await transaction.restaurant.update({
      where: { id: restaurant.id },
      data: { archivedAt, revision: { increment: 1 } },
    });
    await transaction.adminAuditLog.create({
      data: {
        restaurantId: restaurant.id,
        actorProfileId: input.actorProfileId,
        action: input.archived ? "RESTAURANT_ARCHIVED" : "RESTAURANT_RESTORED",
        targetType: "Restaurant",
        targetId: restaurant.id,
        details: { reason: input.reason, name: restaurant.name },
        ipHash: input.ipHash,
      },
    });
    return restaurant;
  });
}
