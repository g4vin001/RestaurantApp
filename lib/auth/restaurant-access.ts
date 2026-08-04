export type ManagerMembershipClaim = {
  restaurantId: string;
  role: "OWNER" | "MANAGER";
  active: boolean;
};

export function resolveRestaurantAccess(
  memberships: readonly ManagerMembershipClaim[],
  requestedRestaurantId?: string,
) {
  const activeMemberships = memberships.filter((membership) => membership.active);

  if (requestedRestaurantId) {
    return (
      activeMemberships.find(
        (membership) => membership.restaurantId === requestedRestaurantId,
      ) ?? null
    );
  }

  return activeMemberships[0] ?? null;
}
