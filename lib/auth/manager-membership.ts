import "server-only";
import { prisma } from "@/lib/prisma";
import {
  resolveRestaurantAccess,
  type ManagerMembershipClaim,
} from "./restaurant-access";

export async function getActiveManagerMembership(
  profileId: string,
  requestedRestaurantId?: string,
) {
  const memberships = await prisma.restaurantMembership.findMany({
    where: {
      profileId,
      active: true,
      role: { in: ["OWNER", "MANAGER"] },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      restaurantId: true,
      role: true,
      active: true,
      restaurant: {
        select: {
          id: true,
          name: true,
          slug: true,
          timezone: true,
          locale: true,
        },
      },
    },
  });

  const managerClaims: ManagerMembershipClaim[] = memberships.flatMap(
    (membership) =>
      membership.role === "OWNER" || membership.role === "MANAGER"
        ? [
            {
              restaurantId: membership.restaurantId,
              role: membership.role,
              active: membership.active,
            },
          ]
        : [],
  );

  const access = resolveRestaurantAccess(managerClaims, requestedRestaurantId);

  if (!access) return null;

  return (
    memberships.find(
      (membership) =>
        membership.restaurantId === access.restaurantId &&
        membership.role === access.role,
    ) ?? null
  );
}
