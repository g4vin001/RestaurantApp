import "server-only";
import type { PrismaClient } from "@/lib/generated/prisma/client";

export type CreateRestaurantAsAdminInput = {
  ownerId: string;
  name: string;
  location: string;
  cuisineType?: string;
  slug: string;
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

// TableStatusEvent and DiningSession both reference DiningTable with
// onDelete: Restrict (they're an audit trail, not something a table's
// removal should quietly wipe in normal operation) — so a plain
// restaurant.delete() can't safely rely on cascade order to clear them
// before DiningTable rows go. Delete them explicitly first; everything else
// (memberships, staff, floor plans/versions/elements, queue, reservations,
// dining tables themselves) cascades cleanly from the Restaurant delete.
export async function deleteRestaurantAsAdmin(client: PrismaClient, restaurantId: string) {
  await client.$transaction(async (transaction) => {
    await transaction.tableStatusEvent.deleteMany({ where: { restaurantId } });
    await transaction.diningSession.deleteMany({ where: { restaurantId } });
    await transaction.restaurant.delete({ where: { id: restaurantId } });
  });
}
