import "server-only";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { DemoState } from "@/lib/domain/types";
import { selectPublicRestaurantState } from "@/lib/domain/analytics";
import {
  buildPublicFloor,
  toPublicTableStatus,
  type PublicTableStatus,
  type PublicFloorSource,
  type PublicReservationSource,
} from "@/lib/customer/public-floor";
import { asRecord, finiteNumber } from "@/lib/repositories/prisma/json-settings";
import { APPROVED_RESERVATION_STATUSES, TABLE_HOLD_RESERVATION_STATUSES, isReservationInSeatingWindow } from "@/lib/domain/booking-conflicts";
import {
  readOperatingSchedule,
  readReservationAvailability,
  readReservationDurationMinutes,
  MAX_RESERVATION_MINUTES,
} from "@/lib/domain/restaurant-schedule";
import { publicCoverImageUrl } from "@/lib/customer/cover-image";

type PublicRestaurantRow = {
  id: string;
  slug: string;
  name: string;
  location: string;
  cuisineType: string | null;
  timezone: string;
  operatingSettings: unknown;
  walkInAvailability: string;
  lastOperationalUpdateAt: Date | null;
  updatedAt: Date;
  coverImage?: { updatedAt: Date } | null;
  diningTables: {
    id: string;
    capacity: number;
    maxPartySize: number;
    currentStatus: string;
  }[];
  queueEntries: { partySize: number; status: string; joinedAt: Date }[];
  floorPlans?: PublicFloorSource[];
  reservations?: Array<PublicReservationSource & { status: string }>;
};

// The table detail can show later bookings beyond the current seating window.
const PUBLIC_RESERVATION_LOOKAHEAD_MS = 12 * 60 * 60_000;

function publicBookingSelect(now: Date) {
  return {
    where: {
      status: { in: [...TABLE_HOLD_RESERVATION_STATUSES] },
      assignedTableId: { not: null },
      scheduledAt: {
        gt: new Date(now.getTime() - MAX_RESERVATION_MINUTES * 60_000),
        lte: new Date(now.getTime() + PUBLIC_RESERVATION_LOOKAHEAD_MS),
      },
    },
    select: { assignedTableId: true, scheduledAt: true, status: true },
  };
}

// The public projection intentionally contains only safe aggregates plus the
// explicitly published floor geometry. Raw queue entries, reservation details,
// contacts, notes, staff data, table events, draft floor plans, arbitrary TEXT,
// host stands, and kitchen geometry never reach the customer browser.
function mapPublicRestaurantRow(restaurant: PublicRestaurantRow, now: Date) {
  const settings = asRecord(restaurant.operatingSettings);
  const availability = readReservationAvailability(settings);
  const nowIso = now.toISOString();
  const duration = readReservationDurationMinutes(settings);
  const bookings = restaurant.reservations ?? [];
  const approvedBookings = bookings.filter(({ status }) => APPROVED_RESERVATION_STATUSES.some((value) => value === status));
  const confirmedTableIds = new Set(approvedBookings
    .filter((booking) => isReservationInSeatingWindow(booking.scheduledAt, now, duration))
    .map((booking) => booking.assignedTableId));
  const heldTableIds = new Set(bookings
    .filter((booking) => isReservationInSeatingWindow(booking.scheduledAt, now, duration))
    .map((booking) => booking.assignedTableId));
  const liveStatuses = new Map<string, PublicTableStatus>();
  for (const table of restaurant.diningTables) {
    let status = toPublicTableStatus(table.currentStatus);
    if (status === "RESERVED" || (status === "AVAILABLE" && heldTableIds.has(table.id))) {
      // Legacy manual reserves still hold the table. Only approved bookings
      // with a seating window justify a public reservation label.
      status = confirmedTableIds.has(table.id) ? "RESERVED" : "UNAVAILABLE";
    }
    liveStatuses.set(table.id, status);
  }
  const assembled: DemoState = {
    version: 2,
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      location: restaurant.location,
      timezone: restaurant.timezone || "Asia/Manila",
      isOpen: restaurant.walkInAvailability !== "PAUSED",
      cleaningTargetMinutes: finiteNumber(settings?.cleaningTargetMinutes, 12),
      reservationDurationMinutes: duration,
      acceptsReservations: availability.acceptsReservations,
      reservationBlockedDates: availability.blockedDates,
      reservationNotes: "",
      reservationWindows: null,
      opensAtHour: finiteNumber(settings?.opensAtHour, 10),
      closesAtHour: finiteNumber(settings?.closesAtHour, 22),
      schedule: readOperatingSchedule(settings ?? {}),
    },
    tables: restaurant.diningTables.map((table) => ({
      id: table.id,
      label: "",
      capacity: table.capacity,
      maxPartySize: table.maxPartySize,
      zone: "",
      status: table.currentStatus === "AVAILABLE" && heldTableIds.has(table.id)
        ? "RESERVED"
        : table.currentStatus as DemoState["tables"][number]["status"],
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
  const upcomingBookings = approvedBookings.filter((booking) => booking.scheduledAt >= now);
  // Every published floor is live; customers switch between them.
  const publicFloors = (restaurant.floorPlans ?? []).flatMap((plan) => {
    const floor = buildPublicFloor(plan, upcomingBookings, liveStatuses);
    return floor ? [floor] : [];
  });
  const available = restaurant.diningTables.filter(
    (table) => liveStatuses.get(table.id) === "AVAILABLE",
  );
  const floorPublishedAt = publicFloors
    .map((floor) => floor.publishedAt)
    .sort()
    .at(-1);
  const lastUpdatedAt =
    floorPublishedAt && Date.parse(floorPublishedAt) > Date.parse(base.lastUpdatedAt)
      ? floorPublishedAt
      : base.lastUpdatedAt;

  return {
    restaurantId: restaurant.id,
    checkedAt: nowIso,
    slug: restaurant.slug,
    cuisineType: restaurant.cuisineType ?? undefined,
    acceptsReservations: availability.acceptsReservations,
    coverImageUrl: restaurant.coverImage
      ? publicCoverImageUrl(restaurant.slug, restaurant.coverImage.updatedAt)
      : undefined,
    timezone: restaurant.timezone || "Asia/Manila",
    ...base,
    lastUpdatedAt,
    publicFloors,
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
    reservedTables: Array.from(liveStatuses.values()).filter((status) => status === "RESERVED").length,
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
      timezone: true,
      operatingSettings: true,
      walkInAvailability: true,
      lastOperationalUpdateAt: true,
      updatedAt: true,
      coverImage: { select: { updatedAt: true } },
      diningTables: {
        where: { active: true, archivedAt: null },
        select: {
          id: true,
          capacity: true,
          maxPartySize: true,
          currentStatus: true,
        },
      },
      queueEntries: {
        where: { status: { in: ["WAITING", "CALLED"] } },
        select: { partySize: true, status: true, joinedAt: true },
      },
      // An assigned pending request can hold a table internally. Only approved
      // booking times appear in customer responses.
      reservations: publicBookingSelect(now),
      floorPlans: {
        where: {
          archivedAt: null,
          activeVersionId: { not: null },
        },
        orderBy: { createdAt: "asc" },
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
      timezone: true,
      operatingSettings: true,
      walkInAvailability: true,
      lastOperationalUpdateAt: true,
      updatedAt: true,
      coverImage: { select: { updatedAt: true } },
      diningTables: {
        where: { active: true, archivedAt: null },
        select: {
          id: true,
          capacity: true,
          maxPartySize: true,
          currentStatus: true,
        },
      },
      queueEntries: {
        where: { status: { in: ["WAITING", "CALLED"] } },
        select: { partySize: true, status: true, joinedAt: true },
      },
      reservations: publicBookingSelect(now),
    },
    orderBy: { name: "asc" },
  });
  return restaurants.map((restaurant) => mapPublicRestaurantRow(restaurant, now));
}

export type PublicRestaurantView = NonNullable<
  Awaited<ReturnType<typeof fetchPublicRestaurantBySlug>>
>;
