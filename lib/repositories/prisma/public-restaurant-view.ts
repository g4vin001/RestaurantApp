import "server-only";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { DemoState } from "@/lib/domain/types";
import { selectPublicRestaurantState } from "@/lib/domain/analytics";
import { asRecord, finiteNumber } from "@/lib/repositories/prisma/json-settings";

// Only aggregate/derived fields ever reach the customer — no raw queue
// entries, reservations, contacts, notes, or staff data. See
// lib/domain/analytics.ts's selectPublicRestaurantState, which this reuses
// rather than forking, and AGENTS.md's public-surface rules.
function mapPublicRestaurantRow(
  restaurant: {
    id: string;
    slug: string;
    name: string;
    location: string;
    cuisineType: string | null;
    operatingSettings: unknown;
    walkInAvailability: string;
    lastOperationalUpdateAt: Date | null;
    updatedAt: Date;
    diningTables: { capacity: number; currentStatus: string }[];
    queueEntries: { partySize: number; status: string; joinedAt: Date }[];
  },
  now: Date,
) {
  const settings = asRecord(restaurant.operatingSettings);
  const nowIso = now.toISOString();
  const assembled: DemoState = {
    version: 2,
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      location: restaurant.location,
      timezone: "Asia/Manila",
      isOpen: restaurant.walkInAvailability !== "PAUSED",
      cleaningTargetMinutes: finiteNumber(settings?.cleaningTargetMinutes, 12),
      opensAtHour: finiteNumber(settings?.opensAtHour, 10),
      closesAtHour: finiteNumber(settings?.closesAtHour, 22),
    },
    tables: restaurant.diningTables.map((table, index) => ({
      id: `t-${index}`,
      label: "",
      capacity: table.capacity,
      zone: "",
      status: table.currentStatus as DemoState["tables"][number]["status"],
      statusChangedAt: nowIso,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      rotation: 0,
      shape: "ROUND",
      active: true,
    })),
    floorPlans: [],
    activeFloorPlanId: "",
    queue: restaurant.queueEntries.map((entry, index) => ({
      id: `q-${index}`,
      partyName: "",
      partySize: entry.partySize,
      status: entry.status as DemoState["queue"][number]["status"],
      joinedAt: entry.joinedAt.toISOString(),
      promisedWaitMinutes: 0,
      updatedAt: entry.joinedAt.toISOString(),
    })),
    sessions: [],
    events: [],
    reservations: [],
    staff: [],
    lastUpdatedAt: (restaurant.lastOperationalUpdateAt ?? restaurant.updatedAt).toISOString(),
  };

  return {
    restaurantId: restaurant.id,
    slug: restaurant.slug,
    cuisineType: restaurant.cuisineType ?? undefined,
    ...selectPublicRestaurantState(assembled, now),
  };
}

export async function fetchPublicRestaurantBySlug(
  client: PrismaClient,
  slug: string,
  now = new Date(),
) {
  const restaurant = await client.restaurant.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      location: true,
      cuisineType: true,
      operatingSettings: true,
      walkInAvailability: true,
      lastOperationalUpdateAt: true,
      updatedAt: true,
      diningTables: {
        where: { active: true, archivedAt: null },
        select: { capacity: true, currentStatus: true },
      },
      queueEntries: {
        where: { status: { in: ["WAITING", "CALLED"] } },
        select: { partySize: true, status: true, joinedAt: true },
      },
    },
  });
  if (!restaurant) return null;
  return mapPublicRestaurantRow(restaurant, now);
}

export async function fetchPublicRestaurants(client: PrismaClient, now = new Date()) {
  const restaurants = await client.restaurant.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      location: true,
      cuisineType: true,
      operatingSettings: true,
      walkInAvailability: true,
      lastOperationalUpdateAt: true,
      updatedAt: true,
      diningTables: {
        where: { active: true, archivedAt: null },
        select: { capacity: true, currentStatus: true },
      },
      queueEntries: {
        where: { status: { in: ["WAITING", "CALLED"] } },
        select: { partySize: true, status: true, joinedAt: true },
      },
    },
    orderBy: { name: "asc" },
  });
  return restaurants.map((restaurant) => mapPublicRestaurantRow(restaurant, now));
}

export type PublicRestaurantView = NonNullable<
  Awaited<ReturnType<typeof fetchPublicRestaurantBySlug>>
>;
