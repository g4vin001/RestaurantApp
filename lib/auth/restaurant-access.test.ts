import { describe, expect, it } from "vitest";
import { resolveRestaurantAccess } from "./restaurant-access";

const memberships = [
  {
    restaurantId: "restaurant-a",
    role: "OWNER" as const,
    active: true,
  },
  {
    restaurantId: "restaurant-b",
    role: "MANAGER" as const,
    active: false,
  },
];

describe("resolveRestaurantAccess", () => {
  it("selects an active membership when no restaurant is requested", () => {
    expect(resolveRestaurantAccess(memberships)?.restaurantId).toBe(
      "restaurant-a",
    );
  });

  it("denies a restaurant outside the active memberships", () => {
    expect(resolveRestaurantAccess(memberships, "restaurant-b")).toBeNull();
    expect(resolveRestaurantAccess(memberships, "restaurant-c")).toBeNull();
  });

  it("allows an explicitly requested active membership", () => {
    expect(
      resolveRestaurantAccess(memberships, "restaurant-a")?.role,
    ).toBe("OWNER");
  });
});
