import "server-only";
import { prisma } from "@/lib/prisma";

export async function getActiveStaffAccess(profileId: string) {
  return prisma.restaurantMembership.findFirst({
    where: {
      profileId,
      active: true,
      role: "STAFF",
      staffRecord: {
        active: true,
        archivedAt: null,
        accessStatus: "ACTIVE",
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      restaurantId: true,
      restaurant: { select: { id: true, name: true, slug: true } },
      staffRecord: {
        select: {
          id: true,
          name: true,
          jobTitle: true,
          permissionPreset: true,
        },
      },
    },
  });
}
