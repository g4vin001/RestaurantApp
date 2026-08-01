import type { DemoState } from "@/lib/domain/types";

export function minutesBetween(start: string, end: string) {
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 60_000));
}

export function deriveOverview(state: DemoState, now = new Date()) {
  const activeTables = state.tables.filter((table) => table.active);
  const counts = activeTables.reduce<Record<string, number>>((result, table) => {
    result[table.status] = (result[table.status] ?? 0) + 1;
    return result;
  }, {});
  const waiting = state.queue.filter((entry) => entry.status === "WAITING" || entry.status === "CALLED");
  const completedSessions = state.sessions.filter((session) => session.clearedAt);
  const durations = completedSessions.map((session) =>
    minutesBetween(session.seatedAt, session.clearedAt as string),
  );
  const longestWaiting = [...waiting].sort(
    (a, b) => Date.parse(a.joinedAt) - Date.parse(b.joinedAt),
  )[0];
  const overdueCleaning = activeTables.filter(
    (table) =>
      table.status === "CLEANING" &&
      minutesBetween(table.statusChangedAt, now.toISOString()) > state.restaurant.cleaningTargetMinutes,
  );

  return {
    totalTables: activeTables.length,
    available: counts.AVAILABLE ?? 0,
    occupied: counts.OCCUPIED ?? 0,
    reserved: counts.RESERVED ?? 0,
    cleaning: counts.CLEANING ?? 0,
    outOfService: counts.OUT_OF_SERVICE ?? 0,
    occupancyRate: activeTables.length
      ? Math.round(((counts.OCCUPIED ?? 0) / activeTables.length) * 100)
      : null,
    queueCount: waiting.length,
    estimatedWaitMinutes: waiting.length ? Math.max(10, waiting.length * 7) : 0,
    longestWaiting,
    longestWaitMinutes: longestWaiting
      ? minutesBetween(longestWaiting.joinedAt, now.toISOString())
      : null,
    completedSeatings: completedSessions.length,
    averageDiningMinutes: durations.length
      ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
      : null,
    overdueCleaning,
  };
}
