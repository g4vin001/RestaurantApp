import "server-only";
import type { PrismaClient } from "@/lib/generated/prisma/client";

export type CreateRestaurantAsAdminInput = {
  ownerId: string;
  name: string;
  location: string;
  cuisineType?: string;
  slug: string;
  environment?: "LIVE" | "TEST";
};

// Deliberately does NOT carry owner-onboarding.ts's "one active restaurant
// per profile" guard — that rule is specific to self-service signup
// (AGENTS.md ​§9), not to this admin tool, where reusing an owner email
// across several test restaurants is the whole point. Always creates a new
// restaurant; never a silent no-op.
export async function createRestaurantAsAdmin(
  client: PrismaClient,
  input: CreateRestaurantAsAdminInput,
) {
  return client.$transaction(
    async (transaction) => {
      const restaurant = await transaction.restaurant.create({
        data: {
          name: input.name,
          location: input.location,
          cuisineType: input.cuisineType,
          slug: input.slug,
          environment: input.environment ?? "LIVE",
          timezone: "Asia/Manila",
          locale: "en-PH",
          operatingSettings: {
            opensAtHour: 10,
            closesAtHour: 22,
            cleaningTargetMinutes: 12,
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
    },
    { isolationLevel: "Serializable" },
  );
}

export async function setRestaurantArchivedAsAdmin(
  client: PrismaClient,
  input: { restaurantId: string; actorProfileId: string; archived: boolean; reason: string; ipHash?: string },
) {
  return client.$transaction(async (transaction) => {
    const restaurant = await transaction.restaurant.findUnique({
      where: { id: input.restaurantId },
      select: { id: true, name: true, archivedAt: true },
    });
    if (!restaurant) throw new Error("Restaurant not found.");
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
  }, { isolationLevel: "Serializable" });
}
