import type { DemoState, DiningTable, TableSession } from "@/lib/domain/types";

function minutesAgo(now: Date, minutes: number) {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

export function createDemoState(now = new Date()): DemoState {
  const tableSeed: Array<Pick<DiningTable, "id" | "label" | "capacity" | "zone" | "status" | "x" | "y" | "width" | "height" | "shape"> & { changedMinutesAgo: number }> = [
    { id: "table-01", label: "T1", capacity: 2, zone: "Window", status: "OCCUPIED", x: 120, y: 110, width: 140, height: 140, shape: "ROUND", changedMinutesAgo: 38 },
    { id: "table-02", label: "T2", capacity: 2, zone: "Window", status: "AVAILABLE", x: 340, y: 110, width: 140, height: 140, shape: "ROUND", changedMinutesAgo: 12 },
    { id: "table-03", label: "T3", capacity: 4, zone: "Main dining", status: "OCCUPIED", x: 600, y: 100, width: 190, height: 150, shape: "RECTANGLE", changedMinutesAgo: 64 },
    { id: "table-04", label: "T4", capacity: 4, zone: "Main dining", status: "CLEANING", x: 900, y: 100, width: 190, height: 150, shape: "RECTANGLE", changedMinutesAgo: 18 },
    { id: "table-05", label: "T5", capacity: 4, zone: "Main dining", status: "RESERVED", x: 600, y: 390, width: 190, height: 150, shape: "RECTANGLE", changedMinutesAgo: 9 },
    { id: "table-06", label: "T6", capacity: 6, zone: "Family", status: "AVAILABLE", x: 900, y: 370, width: 250, height: 170, shape: "RECTANGLE", changedMinutesAgo: 26 },
    { id: "table-07", label: "B1", capacity: 4, zone: "Booths", status: "OCCUPIED", x: 120, y: 420, width: 240, height: 150, shape: "BOOTH", changedMinutesAgo: 29 },
    { id: "table-08", label: "B2", capacity: 4, zone: "Booths", status: "OUT_OF_SERVICE", x: 120, y: 680, width: 240, height: 150, shape: "BOOTH", changedMinutesAgo: 95 },
    { id: "table-09", label: "T7", capacity: 2, zone: "Patio", status: "AVAILABLE", x: 590, y: 710, width: 140, height: 140, shape: "SQUARE", changedMinutesAgo: 44 },
    { id: "table-10", label: "T8", capacity: 2, zone: "Patio", status: "HELD", x: 840, y: 710, width: 140, height: 140, shape: "SQUARE", changedMinutesAgo: 6 },
  ];

  const tables: DiningTable[] = tableSeed.map(({ changedMinutesAgo, ...table }) => ({
    ...table,
    rotation: 0,
    active: true,
    statusChangedAt: minutesAgo(now, changedMinutesAgo),
  }));

  const sessions: TableSession[] = [
    { id: "session-01", tableId: "table-02", partySize: 2, seatedAt: minutesAgo(now, 210), clearedAt: minutesAgo(now, 162), readyAt: minutesAgo(now, 154) },
    { id: "session-02", tableId: "table-06", partySize: 5, seatedAt: minutesAgo(now, 185), clearedAt: minutesAgo(now, 118), readyAt: minutesAgo(now, 108) },
    { id: "session-03", tableId: "table-04", partySize: 4, seatedAt: minutesAgo(now, 108), clearedAt: minutesAgo(now, 18) },
    { id: "session-04", tableId: "table-01", partySize: 2, seatedAt: minutesAgo(now, 38) },
    { id: "session-05", tableId: "table-03", partySize: 4, seatedAt: minutesAgo(now, 64) },
    { id: "session-06", tableId: "table-07", partySize: 3, seatedAt: minutesAgo(now, 29) },
  ];

  return {
    version: 1,
    restaurant: {
      id: "salu-salo-kitchen",
      name: "Salu-Salo Kitchen",
      location: "Quezon City",
      timezone: "Asia/Manila",
      isOpen: true,
      cleaningTargetMinutes: 12,
    },
    tables,
    sessions,
    queue: [
      { id: "queue-01", partyName: "Garcia family", partySize: 4, status: "WAITING", joinedAt: minutesAgo(now, 31), promisedWaitMinutes: 25 },
      { id: "queue-02", partyName: "Ana C.", partySize: 2, status: "CALLED", joinedAt: minutesAgo(now, 19), promisedWaitMinutes: 15 },
      { id: "queue-03", partyName: "Reyes group", partySize: 5, status: "WAITING", joinedAt: minutesAgo(now, 8), promisedWaitMinutes: 30 },
      { id: "queue-04", partyName: "M. Santos", partySize: 3, status: "SEATED", joinedAt: minutesAgo(now, 96), promisedWaitMinutes: 20, seatedAt: minutesAgo(now, 71) },
    ],
    reservations: [
      { id: "reservation-01", partyName: "Dela Cruz", partySize: 4, scheduledAt: new Date(now.getTime() + 25 * 60_000).toISOString(), status: "CONFIRMED", tableId: "table-05" },
      { id: "reservation-02", partyName: "Lim family", partySize: 6, scheduledAt: new Date(now.getTime() + 70 * 60_000).toISOString(), status: "CONFIRMED", tableId: "table-06" },
    ],
    events: [],
    lastUpdatedAt: now.toISOString(),
  };
}
