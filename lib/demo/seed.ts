import type {
  DemoState,
  DiningTable,
  FloorElement,
  TableSession,
} from "@/lib/domain/types";

function minutesAgo(now: Date, minutes: number) {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

function manilaTimeDaysAgo(
  now: Date,
  daysAgo: number,
  hour: number,
  minute: number,
) {
  const shifted = new Date(now.getTime() + 8 * 60 * 60_000);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate() - daysAgo,
      hour - 8,
      minute,
    ),
  );
}

export function createDemoState(now = new Date()): DemoState {
  const tableSeed: Array<
    Pick<
      DiningTable,
      | "id"
      | "label"
      | "capacity"
      | "zone"
      | "status"
      | "x"
      | "y"
      | "width"
      | "height"
      | "shape"
    > & { changedMinutesAgo: number }
  > = [
    {
      id: "table-01",
      label: "T1",
      capacity: 2,
      zone: "Window",
      status: "OCCUPIED",
      x: 120,
      y: 110,
      width: 140,
      height: 140,
      shape: "ROUND",
      changedMinutesAgo: 38,
    },
    {
      id: "table-02",
      label: "T2",
      capacity: 2,
      zone: "Window",
      status: "AVAILABLE",
      x: 340,
      y: 110,
      width: 140,
      height: 140,
      shape: "ROUND",
      changedMinutesAgo: 12,
    },
    {
      id: "table-03",
      label: "T3",
      capacity: 4,
      zone: "Main dining",
      status: "OCCUPIED",
      x: 600,
      y: 100,
      width: 190,
      height: 150,
      shape: "RECTANGLE",
      changedMinutesAgo: 64,
    },
    {
      id: "table-04",
      label: "T4",
      capacity: 4,
      zone: "Main dining",
      status: "CLEANING",
      x: 900,
      y: 100,
      width: 190,
      height: 150,
      shape: "RECTANGLE",
      changedMinutesAgo: 18,
    },
    {
      id: "table-05",
      label: "T5",
      capacity: 4,
      zone: "Main dining",
      status: "RESERVED",
      x: 600,
      y: 390,
      width: 190,
      height: 150,
      shape: "RECTANGLE",
      changedMinutesAgo: 9,
    },
    {
      id: "table-06",
      label: "T6",
      capacity: 6,
      zone: "Family",
      status: "AVAILABLE",
      x: 900,
      y: 370,
      width: 250,
      height: 170,
      shape: "RECTANGLE",
      changedMinutesAgo: 26,
    },
    {
      id: "table-07",
      label: "B1",
      capacity: 4,
      zone: "Booths",
      status: "OCCUPIED",
      x: 120,
      y: 420,
      width: 240,
      height: 150,
      shape: "BOOTH",
      changedMinutesAgo: 29,
    },
    {
      id: "table-08",
      label: "B2",
      capacity: 4,
      zone: "Booths",
      status: "OUT_OF_SERVICE",
      x: 120,
      y: 680,
      width: 240,
      height: 150,
      shape: "BOOTH",
      changedMinutesAgo: 95,
    },
    {
      id: "table-09",
      label: "T7",
      capacity: 2,
      zone: "Patio",
      status: "AVAILABLE",
      x: 590,
      y: 710,
      width: 140,
      height: 140,
      shape: "SQUARE",
      changedMinutesAgo: 44,
    },
    {
      id: "table-10",
      label: "T8",
      capacity: 2,
      zone: "Patio",
      status: "HELD",
      x: 840,
      y: 710,
      width: 140,
      height: 140,
      shape: "SQUARE",
      changedMinutesAgo: 6,
    },
  ];

  const tables: DiningTable[] = tableSeed.map(
    ({ changedMinutesAgo, ...table }) => ({
      ...table,
      rotation: 0,
      active: true,
      statusChangedAt: minutesAgo(now, changedMinutesAgo),
    }),
  );

  const sessions: TableSession[] = [
    {
      id: "session-01",
      tableId: "table-02",
      partySize: 2,
      seatedAt: minutesAgo(now, 210),
      clearedAt: minutesAgo(now, 162),
      readyAt: minutesAgo(now, 154),
    },
    {
      id: "session-02",
      tableId: "table-06",
      partySize: 5,
      seatedAt: minutesAgo(now, 185),
      clearedAt: minutesAgo(now, 118),
      readyAt: minutesAgo(now, 108),
    },
    {
      id: "session-03",
      tableId: "table-04",
      partySize: 4,
      seatedAt: minutesAgo(now, 108),
      clearedAt: minutesAgo(now, 18),
    },
    {
      id: "session-04",
      tableId: "table-01",
      partySize: 2,
      seatedAt: minutesAgo(now, 38),
    },
    {
      id: "session-05",
      tableId: "table-03",
      partySize: 4,
      seatedAt: minutesAgo(now, 64),
    },
    {
      id: "session-06",
      tableId: "table-07",
      partySize: 3,
      seatedAt: minutesAgo(now, 29),
    },
  ];
  const historicalSessions: TableSession[] = [];
  const historicalQueue: DemoState["queue"] = [];
  for (let day = 1; day <= 30; day += 1) {
    const weekday = manilaTimeDaysAgo(now, day, 12, 0).getUTCDay();
    const weekendBoost = weekday === 0 || weekday === 6 ? 1 : 0;
    for (let tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
      const turns = 1 + ((day + tableIndex + weekendBoost) % 3);
      for (let turn = 0; turn < turns; turn += 1) {
        const seatedAt = manilaTimeDaysAgo(
          now,
          day,
          11 + turn * 3,
          tableIndex * 7,
        );
        const duration = 42 + ((day * 7 + tableIndex * 11 + turn * 13) % 44);
        const cleaning =
          tableIndex === 3 && day % 6 === 0 ? 22 : 7 + ((day + tableIndex) % 8);
        historicalSessions.push({
          id: `history-session-${day}-${tableIndex}-${turn}`,
          tableId: tables[tableIndex].id,
          partySize: Math.max(
            1,
            Math.min(
              tables[tableIndex].capacity,
              1 + ((day + tableIndex + turn) % tables[tableIndex].capacity),
            ),
          ),
          seatedAt: seatedAt.toISOString(),
          clearedAt: new Date(
            seatedAt.getTime() + duration * 60_000,
          ).toISOString(),
          readyAt: new Date(
            seatedAt.getTime() + (duration + cleaning) * 60_000,
          ).toISOString(),
        });
      }
    }
    for (let queueIndex = 0; queueIndex < 3 + weekendBoost; queueIndex += 1) {
      const joinedAt = manilaTimeDaysAgo(
        now,
        day,
        12 + queueIndex * 2,
        queueIndex * 13,
      );
      const promisedWait = 15 + ((day + queueIndex) % 4) * 5;
      const actualWait = promisedWait + ((day * 3 + queueIndex * 7) % 17) - 6;
      const status =
        queueIndex === 2 && day % 4 === 0
          ? "CANCELLED"
          : queueIndex === 3
            ? "NO_SHOW"
            : "SEATED";
      historicalQueue.push({
        id: `history-queue-${day}-${queueIndex}`,
        partyName: `Historical party ${day}-${queueIndex}`,
        partySize: 1 + ((day + queueIndex) % 6),
        promisedWaitMinutes: promisedWait,
        status,
        joinedAt: joinedAt.toISOString(),
        seatedAt:
          status === "SEATED"
            ? new Date(joinedAt.getTime() + actualWait * 60_000).toISOString()
            : undefined,
        cancelledAt:
          status === "CANCELLED"
            ? new Date(joinedAt.getTime() + actualWait * 60_000).toISOString()
            : undefined,
        noShowAt:
          status === "NO_SHOW"
            ? new Date(joinedAt.getTime() + actualWait * 60_000).toISOString()
            : undefined,
        assignedTableId:
          status === "SEATED"
            ? tables[(day + queueIndex) % tables.length].id
            : undefined,
        updatedAt: new Date(
          joinedAt.getTime() + Math.max(actualWait, 1) * 60_000,
        ).toISOString(),
      });
    }
  }

  const tableElements: FloorElement[] = tables.map((table, index) => ({
    id: `element-${table.id}`,
    type: "TABLE",
    tableId: table.id,
    label: table.label,
    zone: table.zone,
    capacity: table.capacity,
    minPartySize: 1,
    maxPartySize: table.capacity,
    shape: table.shape,
    x: table.x,
    y: table.y,
    width: table.width,
    height: table.height,
    rotation: table.rotation,
    zIndex: 10 + index,
    locked: false,
    visible: true,
    color: "emerald",
  }));
  const floorElements: FloorElement[] = [
    {
      id: "zone-main",
      type: "ZONE",
      label: "Main dining",
      x: 500,
      y: 40,
      width: 720,
      height: 570,
      rotation: 0,
      zIndex: 1,
      locked: true,
      visible: true,
      color: "stone",
    },
    {
      id: "door-main",
      type: "DOOR",
      label: "Main entrance",
      x: 710,
      y: 0,
      width: 180,
      height: 36,
      rotation: 0,
      zIndex: 40,
      locked: false,
      visible: true,
    },
    {
      id: "host-main",
      type: "HOST_STAND",
      label: "Host stand",
      x: 680,
      y: 55,
      width: 230,
      height: 90,
      rotation: 0,
      zIndex: 8,
      locked: false,
      visible: true,
    },
    {
      id: "kitchen-main",
      type: "KITCHEN",
      label: "Kitchen & service",
      x: 1235,
      y: 120,
      width: 320,
      height: 670,
      rotation: 0,
      zIndex: 3,
      locked: true,
      visible: true,
    },
    {
      id: "waiting-main",
      type: "WAITING_AREA",
      label: "Waiting area",
      x: 590,
      y: 830,
      width: 410,
      height: 120,
      rotation: 0,
      zIndex: 4,
      locked: false,
      visible: true,
    },
    ...tableElements,
  ];
  const initialVersion = {
    id: "floor-main-v1",
    version: 1,
    name: "Main dining floor",
    elements: structuredClone(floorElements),
    logicalWidth: 1600,
    logicalHeight: 1000,
    publishedAt: minutesAgo(now, 240),
    publishedBy: "Demo manager",
  };

  return {
    version: 2,
    restaurant: {
      id: "salu-salo",
      name: "Salu-Salo Kitchen",
      location: "Quezon City",
      timezone: "Asia/Manila",
      isOpen: true,
      cleaningTargetMinutes: 12,
      opensAtHour: 11,
      closesAtHour: 22,
    },
    tables,
    floorPlans: [
      {
        id: "floor-main",
        name: "Main dining floor",
        draft: {
          elements: structuredClone(floorElements),
          logicalWidth: 1600,
          logicalHeight: 1000,
          savedAt: minutesAgo(now, 240),
          baseVersion: 1,
        },
        versions: [initialVersion],
        activeVersionId: initialVersion.id,
        updatedAt: minutesAgo(now, 240),
      },
    ],
    activeFloorPlanId: "floor-main",
    sessions: [...historicalSessions, ...sessions],
    queue: [
      {
        id: "queue-01",
        partyName: "Garcia family",
        partySize: 4,
        status: "WAITING",
        joinedAt: minutesAgo(now, 31),
        promisedWaitMinutes: 25,
        notes: "High chair",
        preferredZone: "Main dining",
        updatedAt: minutesAgo(now, 31),
      },
      {
        id: "queue-02",
        partyName: "Ana C.",
        partySize: 2,
        status: "CALLED",
        joinedAt: minutesAgo(now, 19),
        promisedWaitMinutes: 15,
        calledAt: minutesAgo(now, 2),
        updatedAt: minutesAgo(now, 2),
      },
      {
        id: "queue-03",
        partyName: "Reyes group",
        partySize: 5,
        status: "WAITING",
        joinedAt: minutesAgo(now, 8),
        promisedWaitMinutes: 30,
        preferredZone: "Family",
        updatedAt: minutesAgo(now, 8),
      },
      {
        id: "queue-04",
        partyName: "M. Santos",
        partySize: 3,
        status: "SEATED",
        joinedAt: minutesAgo(now, 96),
        promisedWaitMinutes: 20,
        seatedAt: minutesAgo(now, 71),
        assignedTableId: "table-07",
        updatedAt: minutesAgo(now, 71),
      },
      ...historicalQueue,
    ],
    reservations: [
      {
        id: "reservation-01",
        partyName: "Dela Cruz",
        partySize: 4,
        scheduledAt: new Date(now.getTime() + 25 * 60_000).toISOString(),
        status: "CONFIRMED",
        tableId: "table-05",
        notes: "Birthday dinner",
        updatedAt: minutesAgo(now, 90),
      },
      {
        id: "reservation-02",
        partyName: "Lim family",
        partySize: 6,
        scheduledAt: new Date(now.getTime() + 70 * 60_000).toISOString(),
        status: "CONFIRMED",
        tableId: "table-06",
        updatedAt: minutesAgo(now, 70),
      },
    ],
    staff: [
      {
        id: "staff-01",
        name: "Mika Santos",
        jobTitle: "Restaurant manager",
        permissionPreset: "MANAGER",
        active: true,
        accessStatus: "ACCESS_DISABLED",
        createdAt: minutesAgo(now, 60 * 24 * 45),
        updatedAt: minutesAgo(now, 60 * 24 * 4),
      },
      {
        id: "staff-02",
        name: "Carlo Reyes",
        jobTitle: "Host",
        permissionPreset: "HOST",
        active: true,
        accessStatus: "NOT_INVITED",
        createdAt: minutesAgo(now, 60 * 24 * 28),
        updatedAt: minutesAgo(now, 60 * 24 * 2),
      },
      {
        id: "staff-03",
        name: "Jessa Lim",
        jobTitle: "Floor staff",
        permissionPreset: "FLOOR_STAFF",
        active: true,
        accessStatus: "NOT_INVITED",
        createdAt: minutesAgo(now, 60 * 24 * 19),
        updatedAt: minutesAgo(now, 60 * 24),
      },
    ],
    events: [],
    lastUpdatedAt: now.toISOString(),
  };
}
