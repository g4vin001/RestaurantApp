import "server-only";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type {
  FloorElement,
  FloorElementType,
  FloorPlan,
  OperationsState,
  TableShape,
} from "@/lib/domain/types";
import {
  OperationsRepositoryError,
  type OperationsRepository,
} from "@/lib/repositories/operations";
import { asRecord, finiteNumber } from "@/lib/repositories/prisma/json-settings";

const FLOOR_ELEMENT_TYPES = new Set<FloorElementType>([
  "TABLE",
  "BAR",
  "WALL",
  "DOOR",
  "HOST_STAND",
  "WAITING_AREA",
  "KITCHEN",
  "RESTROOM",
  "COLUMN",
  "TEXT",
  "ZONE",
]);

const TABLE_SHAPES = new Set<TableShape>([
  "ROUND",
  "SQUARE",
  "RECTANGLE",
  "BOOTH",
]);

export type PrismaOperationsScope = {
  profileId: string;
  restaurantId: string;
};

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function parseDraftElement(value: unknown): FloorElement | null {
  const element = asRecord(value);
  if (!element) return null;
  if (typeof element.id !== "string" || typeof element.type !== "string") {
    return null;
  }
  if (!FLOOR_ELEMENT_TYPES.has(element.type as FloorElementType)) return null;

  const shape =
    typeof element.shape === "string" &&
    TABLE_SHAPES.has(element.shape as TableShape)
      ? (element.shape as TableShape)
      : undefined;

  return {
    id: element.id,
    type: element.type as FloorElementType,
    x: finiteNumber(element.x, 0),
    y: finiteNumber(element.y, 0),
    width: finiteNumber(element.width, 120),
    height: finiteNumber(element.height, 120),
    rotation: finiteNumber(element.rotation, 0),
    zIndex: finiteNumber(element.zIndex, 0),
    locked: element.locked === true,
    visible: element.visible !== false,
    label: typeof element.label === "string" ? element.label : "",
    zone: optionalString(element.zone),
    tableId: optionalString(element.tableId),
    shape,
    capacity: optionalNumber(element.capacity),
    minPartySize: optionalNumber(element.minPartySize),
    maxPartySize: optionalNumber(element.maxPartySize),
    notes: optionalString(element.notes),
    color: optionalString(element.color),
  };
}

function parseDraftSnapshot(
  value: unknown,
  logicalWidth: number,
  logicalHeight: number,
) {
  const snapshot = asRecord(value);
  const elements = Array.isArray(snapshot?.elements)
    ? snapshot.elements
        .map(parseDraftElement)
        .filter((element): element is FloorElement => element !== null)
    : [];

  return {
    elements,
    logicalWidth: finiteNumber(snapshot?.logicalWidth, logicalWidth),
    logicalHeight: finiteNumber(snapshot?.logicalHeight, logicalHeight),
  };
}

type DatabaseFloorElement = {
  stableElementId: string;
  diningTableId: string | null;
  type: FloorElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  locked: boolean;
  visible: boolean;
  label: string;
  zone: string | null;
  shape: TableShape | null;
  properties: unknown;
};

function mapDatabaseFloorElement(element: DatabaseFloorElement): FloorElement {
  const properties = asRecord(element.properties);
  return {
    id: element.stableElementId,
    type: element.type,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    rotation: element.rotation,
    zIndex: element.zIndex,
    locked: element.locked,
    visible: element.visible,
    label: element.label,
    zone: element.zone ?? undefined,
    tableId: element.diningTableId ?? undefined,
    shape: element.shape ?? undefined,
    capacity: optionalNumber(properties?.capacity),
    minPartySize: optionalNumber(properties?.minPartySize),
    maxPartySize: optionalNumber(properties?.maxPartySize),
    notes: optionalString(properties?.notes),
    color: optionalString(properties?.color),
  };
}

async function fetchRestaurantSnapshot(
  client: PrismaClient,
  scope: PrismaOperationsScope,
) {
  const historyStart = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
  const reservationEnd = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  return client.restaurant.findFirst({
    where: {
      id: scope.restaurantId,
      memberships: {
        some: {
          profileId: scope.profileId,
          active: true,
          role: { in: ["OWNER", "MANAGER"] },
        },
      },
    },
    include: {
      floorPlans: {
        where: { archivedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          versions: {
            orderBy: { version: "desc" },
            take: 20,
            include: {
              publishedBy: { select: { displayName: true } },
              elements: { orderBy: { zIndex: "asc" } },
            },
          },
        },
      },
      diningTables: {
        where: { archivedAt: null },
        orderBy: { label: "asc" },
      },
      tableStatusEvents: {
        where: { occurredAt: { gte: historyStart } },
        orderBy: { occurredAt: "desc" },
        take: 2_000,
        include: { actorProfile: { select: { displayName: true } } },
      },
      diningSessions: {
        where: { seatedAt: { gte: historyStart } },
        orderBy: { seatedAt: "desc" },
        take: 1_000,
      },
      queueEntries: {
        where: {
          OR: [
            { status: { in: ["WAITING", "CALLED"] } },
            { joinedAt: { gte: historyStart } },
          ],
        },
        orderBy: { joinedAt: "asc" },
        take: 1_000,
      },
      reservations: {
        where: {
          OR: [
            { status: { in: ["PENDING_APPROVAL", "CONFIRMED", "ARRIVED", "SEATED"] } },
            { scheduledAt: { gte: historyStart, lte: reservationEnd } },
          ],
        },
        orderBy: { scheduledAt: "asc" },
        take: 1_000,
      },
      staffMembers: {
        where: { archivedAt: null },
        orderBy: { name: "asc" },
      },
    },
  });
}

type RestaurantSnapshotRecord = NonNullable<
  Awaited<ReturnType<typeof fetchRestaurantSnapshot>>
>;

function maxTimestamp(values: Array<Date | null | undefined>) {
  return new Date(
    Math.max(...values.filter((value): value is Date => Boolean(value)).map(Number)),
  ).toISOString();
}

export function mapRestaurantSnapshot(
  restaurant: RestaurantSnapshotRecord,
): OperationsState {
  const settings = asRecord(restaurant.operatingSettings);

  const floorPlans: FloorPlan[] = restaurant.floorPlans.map((plan) => {
    const draft = parseDraftSnapshot(
      plan.draftSnapshot,
      plan.logicalWidth,
      plan.logicalHeight,
    );
    const versions = plan.versions
      .map((version) => ({
        id: version.id,
        version: version.version,
        name: version.name,
        elements: version.elements.map(mapDatabaseFloorElement),
        logicalWidth: version.logicalWidth,
        logicalHeight: version.logicalHeight,
        publishedAt: (version.publishedAt ?? version.createdAt).toISOString(),
        publishedBy: version.publishedBy?.displayName ?? "Manager",
      }))
      .sort((left, right) => left.version - right.version);

    return {
      id: plan.id,
      name: plan.name,
      draft: {
        ...draft,
        savedAt: plan.updatedAt.toISOString(),
        baseVersion: plan.draftRevision,
      },
      versions,
      activeVersionId: plan.activeVersionId,
      updatedAt: plan.updatedAt.toISOString(),
    };
  });

  if (floorPlans.length === 0) {
    throw new OperationsRepositoryError(
      "PERSISTENCE",
      "This restaurant does not have an active floor-plan draft.",
    );
  }

  const publishedElements = floorPlans.flatMap((plan) => {
    const activeVersion = plan.versions.find(
      (version) => version.id === plan.activeVersionId,
    );
    return activeVersion?.elements ?? [];
  });
  const geometryByTableId = new Map(
    publishedElements
      .filter((element) => element.tableId)
      .map((element) => [element.tableId as string, element]),
  );
  const latestEventByTableId = new Map<string, Date>();
  for (const event of restaurant.tableStatusEvents) {
    if (!latestEventByTableId.has(event.diningTableId)) {
      latestEventByTableId.set(event.diningTableId, event.occurredAt);
    }
  }

  const state: OperationsState = {
    version: 2,
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      location: restaurant.location,
      timezone: restaurant.timezone || "Asia/Manila",
      isOpen: restaurant.walkInAvailability !== "PAUSED",
      cleaningTargetMinutes: finiteNumber(
        settings?.cleaningTargetMinutes,
        12,
      ),
      opensAtHour: finiteNumber(settings?.opensAtHour, 10),
      closesAtHour: finiteNumber(settings?.closesAtHour, 22),
    },
    tables: restaurant.diningTables.map((table) => {
      const geometry = geometryByTableId.get(table.id);
      return {
        id: table.id,
        label: table.label,
        capacity: table.capacity,
        minPartySize: table.minPartySize,
        maxPartySize: table.maxPartySize,
        zone: table.zone,
        status: table.currentStatus,
        statusChangedAt: (
          latestEventByTableId.get(table.id) ?? table.updatedAt
        ).toISOString(),
        x: geometry?.x ?? 0,
        y: geometry?.y ?? 0,
        width: geometry?.width ?? 140,
        height: geometry?.height ?? 140,
        rotation: geometry?.rotation ?? 0,
        shape: table.shape,
        active: table.active && table.archivedAt === null,
      };
    }),
    floorPlans,
    activeFloorPlanId: floorPlans[0].id,
    queue: restaurant.queueEntries.map((entry) => ({
      id: entry.id,
      partyName: entry.partyName,
      partySize: entry.partySize,
      status: entry.status,
      joinedAt: entry.joinedAt.toISOString(),
      promisedWaitMinutes: entry.promisedWaitMinutes,
      contact: entry.contact ?? undefined,
      notes: entry.notes ?? undefined,
      preferredZone: entry.preferredZone ?? undefined,
      calledAt: entry.calledAt?.toISOString(),
      seatedAt: entry.seatedAt?.toISOString(),
      cancelledAt: entry.cancelledAt?.toISOString(),
      noShowAt: entry.noShowAt?.toISOString(),
      assignedTableId: entry.assignedTableId ?? undefined,
      assignedTableIds: entry.assignedTableId
        ? [entry.assignedTableId]
        : undefined,
      updatedAt: entry.updatedAt.toISOString(),
    })),
    sessions: restaurant.diningSessions.map((session) => ({
      id: session.id,
      tableId: session.diningTableId,
      partySize: session.partySize,
      seatedAt: session.seatedAt.toISOString(),
      clearedAt: session.clearedAt?.toISOString(),
      readyAt: (session.availableAt ?? session.completedAt)?.toISOString(),
    })),
    events: restaurant.tableStatusEvents
      .map((event) => ({
        id: event.id,
        tableId: event.diningTableId,
        previousStatus: event.fromStatus,
        newStatus: event.toStatus,
        occurredAt: event.occurredAt.toISOString(),
        actor: event.actorProfile?.displayName ?? "Manager",
        note: event.reason ?? undefined,
      }))
      .reverse(),
    reservations: restaurant.reservations.map((reservation) => ({
      id: reservation.id,
      partyName: reservation.partyName,
      partySize: reservation.partySize,
      scheduledAt: reservation.scheduledAt.toISOString(),
      status: reservation.status,
      tableId: reservation.assignedTableId ?? undefined,
      tableIds: reservation.assignedTableId
        ? [reservation.assignedTableId]
        : undefined,
      contact: reservation.contact ?? undefined,
      notes: reservation.notes ?? undefined,
      arrivedAt: reservation.arrivedAt?.toISOString(),
      seatedAt: reservation.seatedAt?.toISOString(),
      completedAt: reservation.completedAt?.toISOString(),
      cancelledAt: reservation.cancelledAt?.toISOString(),
      noShowAt: reservation.noShowAt?.toISOString(),
      updatedAt: reservation.updatedAt.toISOString(),
    })),
    staff: restaurant.staffMembers.map((staff) => ({
      id: staff.id,
      name: staff.name,
      jobTitle: staff.jobTitle,
      contact: staff.contact ?? undefined,
      permissionPreset: staff.permissionPreset,
      active: staff.active,
      accessStatus: staff.accessStatus,
      createdAt: staff.createdAt.toISOString(),
      updatedAt: staff.updatedAt.toISOString(),
    })),
    lastUpdatedAt: maxTimestamp([
      restaurant.updatedAt,
      restaurant.lastOperationalUpdateAt,
      ...restaurant.floorPlans.map((plan) => plan.updatedAt),
      ...restaurant.diningTables.map((table) => table.updatedAt),
      ...restaurant.queueEntries.map((entry) => entry.updatedAt),
      ...restaurant.reservations.map((reservation) => reservation.updatedAt),
      ...restaurant.staffMembers.map((staff) => staff.updatedAt),
      ...restaurant.diningSessions.map((session) => session.updatedAt),
      ...restaurant.tableStatusEvents.map((event) => event.occurredAt),
    ]),
  };

  return state;
}

export class PrismaOperationsRepository implements OperationsRepository {
  readonly mode = "database" as const;

  constructor(
    private readonly client: PrismaClient,
    private readonly scope: PrismaOperationsScope,
  ) {}

  async loadSnapshot(): Promise<OperationsState> {
    try {
      const restaurant = await fetchRestaurantSnapshot(this.client, this.scope);
      if (!restaurant) {
        throw new OperationsRepositoryError(
          "FORBIDDEN",
          "You do not have access to this restaurant.",
        );
      }
      return mapRestaurantSnapshot(restaurant);
    } catch (error) {
      if (error instanceof OperationsRepositoryError) throw error;
      throw new OperationsRepositoryError(
        "PERSISTENCE",
        "Halina could not load the restaurant's shared operational data.",
        { cause: error },
      );
    }
  }
}
