import type { PrismaClient } from "@/lib/generated/prisma/client";

export type CreateOwnedRestaurantInput = {
  profileId: string;
  name: string;
  location: string;
  slug: string;
};

export async function createOwnedRestaurant(
  client: PrismaClient,
  input: CreateOwnedRestaurantInput,
) {
  return client.$transaction(
    async (transaction) => {
      const existingMembership =
        await transaction.restaurantMembership.findFirst({
          where: {
            profileId: input.profileId,
            active: true,
            role: { in: ["OWNER", "MANAGER"] },
          },
          select: {
            id: true,
            restaurantId: true,
          },
        });

      if (existingMembership) {
        return {
          created: false,
          membershipId: existingMembership.id,
          restaurantId: existingMembership.restaurantId,
        };
      }

      const restaurant = await transaction.restaurant.create({
        data: {
          name: input.name,
          location: input.location,
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
              profileId: input.profileId,
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
            where: { profileId: input.profileId },
            select: { id: true },
          },
        },
      });

      return {
        created: true,
        membershipId: restaurant.memberships[0].id,
        restaurantId: restaurant.id,
      };
    },
    { isolationLevel: "Serializable" },
  );
}
