import "server-only";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { DemoState } from "@/lib/domain/types";
import { selectPublicRestaurantState } from "@/lib/domain/analytics";
import {
  buildPublicFloor,
  type PublicFloorSource,
  type PublicReservationSource,
} from "@/lib/customer/public-floor";
import { asRecord, finiteNumber } from "@/lib/repositories/prisma/json-settings";

type PublicRestaurantRow = {
  id: string;
  slug: string;
  name: string;
  location: string;
  cuisineType: string | null;
  operatingSettings: unknown;
  walkInAvailability: string;
  lastOperationalUpdateAt: Date | null;
  updatedAt: Date;
  diningTables: {
    capacity: number;
    maxPartySize: number;
    currentStatus: string;
  }[];
  queueEntries: { partySize: number; status: string; joinedAt: Date }[];
  floorPlans?: PublicFloorSource[];
  reservations?: PublicReservationSource[];
};

// How far ahead the public floor looks when marking a table as booked. Covers a
// full evening service including bookings that land after midnight.
const PUBLIC_RESERVATION_LOOKAHEAD_MS = 12 * 60 * 60_000;

// The public projection intentionally contains only safe aggregates plus the
// explicitly published floor geometry. Raw queue entries, reservation details,
// contacts, notes, staff data, table events, draft floor plans, arbitrary TEXT,
// host stands, and kitchen geometry never reach the customer browser.
function mapPublicRestaurantRow(restaurant: PublicRestaurantRow, now: Date) {
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
      maxPartySize: table.maxPartySize,
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

  const base = selectPublicRestaurantState(assembled, now);
  const publicFloor = buildPublicFloor(
    restaurant.floorPlans?.[0],
    restaurant.reservations ?? [],
  );
  const available = restaurant.diningTables.filter(
    (table) => table.currentStatus === "AVAILABLE",
  );
  const floorPublishedAt = publicFloor?.publishedAt;
  const lastUpdatedAt =
    floorPublishedAt && Date.parse(floorPublishedAt) > Date.parse(base.lastUpdatedAt)
      ? floorPublishedAt
      : base.lastUpdatedAt;

  return {
    restaurantId: restaurant.id,
    slug: restaurant.slug,
    cuisineType: restaurant.cuisineType ?? undefined,
    ...base,
    lastUpdatedAt,
    publicFloor,
    availableSeatCapacity: available.reduce(
      (sum, table) => sum + table.capacity,
      0,
    ),
    largestAvailableTable: available.length
      ? Math.max(...available.map((table) => table.capacity))
      : null,
    preparingTables: restaurant.diningTables.filter(
      (table) => table.currentStatus === "CLEANING",
    ).length,
    // Mirrors what the map actually shows when a floor is published, so the
    // count and the blue tables can't disagree.
    reservedTables:
      publicFloor?.elements.filter(
        (element) => element.type === "TABLE" && element.status === "RESERVED",
      ).length ??
      restaurant.diningTables.filter(
        (table) => table.currentStatus === "RESERVED",
      ).length,
  };
}

export async function fetchPublicRestaurantBySlug(
  client: PrismaClient,
  slug: string,
  now = new Date(),
) {
  const restaurant = await client.restaurant.findFirst({
    where: { slug, environment: "LIVE", archivedAt: null },
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
        select: {
          capacity: true,
          maxPartySize: true,
          currentStatus: true,
        },
      },
      queueEntries: {
        where: { status: { in: ["WAITING", "CALLED"] } },
        select: { partySize: true, status: true, joinedAt: true },
      },
      // Approved bookings already tied to a specific table, for the rest of the
      // service. PENDING_APPROVAL is excluded: an unreviewed request is not yet
      // a commitment the restaurant has made. Only the table and the time are
      // selected — party names, sizes, contacts and notes stay private.
      reservations: {
        where: {
          status: { in: ["CONFIRMED", "ARRIVED"] },
          assignedTableId: { not: null },
          scheduledAt: {
            gte: now,
            lte: new Date(now.getTime() + PUBLIC_RESERVATION_LOOKAHEAD_MS),
          },
        },
        select: { assignedTableId: true, scheduledAt: true },
        orderBy: { scheduledAt: "asc" },
      },
      floorPlans: {
        where: {
          archivedAt: null,
          activeVersionId: { not: null },
        },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          id: true,
          name: true,
          logicalWidth: true,
          logicalHeight: true,
          activeVersion: {
            select: {
              id: true,
              version: true,
              publishedAt: true,
              createdAt: true,
              elements: {
                where: { visible: true },
                orderBy: { zIndex: "asc" },
                select: {
                  stableElementId: true,
                  type: true,
                  x: true,
                  y: true,
                  width: true,
                  height: true,
                  rotation: true,
                  zIndex: true,
                  visible: true,
                  label: true,
                  zone: true,
                  shape: true,
                  diningTable: {
                    select: {
                      id: true,
                      label: true,
                      capacity: true,
                      zone: true,
                      shape: true,
                      currentStatus: true,
                      active: true,
                      archivedAt: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!restaurant) return null;
  return mapPublicRestaurantRow(restaurant, now);
}

export async function fetchPublicRestaurants(
  client: PrismaClient,
  now = new Date(),
) {
  const restaurants = await client.restaurant.findMany({
    where: { environment: "LIVE", archivedAt: null },
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
        select: {
          capacity: true,
          maxPartySize: true,
          currentStatus: true,
        },
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
