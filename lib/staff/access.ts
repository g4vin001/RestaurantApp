import "server-only";
import { prisma } from "@/lib/prisma";

export async function getActiveStaffAccess(profileId: string) {
  return prisma.restaurantMembership.findFirst({
    where: {
      profileId,
      active: true,
      role: "STAFF",
      restaurant: { archivedAt: null },
      staffRecord: {
        active: true,
        archivedAt: null,
        accessStatus: "ACTIVE",
        staffRole: { archivedAt: null },
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      restaurantId: true,
      restaurant: {
        select: {
          id: true,
          name: true,
          slug: true,
          environment: true,
          archivedAt: true,
        },
      },
      staffRecord: {
        select: {
          id: true,
          name: true,
          jobTitle: true,
          permissionPreset: true,
          revision: true,
          staffRole: {
            select: { id: true, name: true, permissions: true, archivedAt: true },
          },
        },
      },
    },
  });
}
