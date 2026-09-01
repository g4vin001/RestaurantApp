import type { DemoState, TableSession } from "@/lib/domain/types";
import {
  restaurantDateParts,
  restaurantWallTimeToUtc,
  startOfRestaurantDay,
} from "@/lib/time/restaurant-time";

export type AnalyticsPreset = "TODAY" | "LAST_7_DAYS" | "LAST_30_DAYS";

export interface AnalyticsRange {
  start: Date;
  end: Date;
  label: string;
}

export function minutesBetween(start: string, end: string) {
  return Math.max(
    0,
    Math.round((Date.parse(end) - Date.parse(start)) / 60_000),
  );
}

export function overlapMinutes(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
) {
  const start = Math.max(startA.getTime(), startB.getTime());
  const end = Math.min(endA.getTime(), endB.getTime());
  return Math.max(0, (end - start) / 60_000);
}

export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function restaurantBoundary(date: Date, hour: number, timeZone?: string) {
  const parts = restaurantDateParts(date, timeZone);
  return restaurantWallTimeToUtc(
    `${parts.year}-${parts.month}-${parts.day}T${String(hour).padStart(2, "0")}:00`,
    timeZone,
  ) as Date;
}

export function getAnalyticsRange(
  preset: AnalyticsPreset,
  now = new Date(),
  timeZone?: string,
): AnalyticsRange {
  const end = now;
  const today = startOfRestaurantDay(now, timeZone);
  if (preset === "TODAY") return { start: today, end, label: "Today" };
  const days = preset === "LAST_7_DAYS" ? 7 : 30;
  return {
    start: new Date(today.getTime() - (days - 1) * 24 * 60 * 60_000),
    end,
    label: preset === "LAST_7_DAYS" ? "Last 7 days" : "Last 30 days",
  };
}

function operatingMinutes(state: DemoState, range: AnalyticsRange) {
  let minutes = 0;
  const timeZone = state.restaurant.timezone;
  const firstDay = startOfRestaurantDay(range.start, timeZone);
  const lastDay = startOfRestaurantDay(range.end, timeZone);
  for (
    let day = firstDay.getTime();
    day <= lastDay.getTime();
    day += 24 * 60 * 60_000
  ) {
    const marker = new Date(day);
    const open = restaurantBoundary(marker, state.restaurant.opensAtHour, timeZone);
    const close = restaurantBoundary(marker, state.restaurant.closesAtHour, timeZone);
    minutes += overlapMinutes(open, close, range.start, range.end);
  }
  return minutes;
}

function sessionEnd(session: TableSession, now: Date) {
  return new Date(session.clearedAt ?? now.toISOString());
}

function average(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

export function estimateCurrentWait(state: DemoState) {
  const waiting = state.queue.filter((entry) =>
    ["WAITING", "CALLED"].includes(entry.status),
  );
  if (!waiting.length) return 0;
  const guestsWaiting = waiting.reduce(
    (sum, entry) => sum + entry.partySize,
    0,
  );
  const availableSeats = state.tables
    .filter((table) => table.active && table.status === "AVAILABLE")
    .reduce((sum, table) => sum + table.capacity, 0);
  if (availableSeats >= guestsWaiting) return 5;
  const occupiedShare =
    state.tables.filter((table) => table.active && table.status === "OCCUPIED")
      .length /
    Math.max(1, state.tables.filter((table) => table.active).length);
  return Math.round(
    8 + waiting.length * 6 + occupiedShare * 18 - Math.min(availableSeats, 10),
  );
}

export function deriveOverview(state: DemoState, now = new Date()) {
  const activeTables = state.tables.filter((table) => table.active);
  const counts = activeTables.reduce<Record<string, number>>(
    (result, table) => {
      result[table.status] = (result[table.status] ?? 0) + 1;
      return result;
    },
    {},
  );
  const waiting = state.queue.filter(
    (entry) => entry.status === "WAITING" || entry.status === "CALLED",
  );
  const today = getAnalyticsRange("TODAY", now);
  const completedSessions = state.sessions.filter(
    (session) =>
      session.clearedAt &&
      Date.parse(session.seatedAt) >= today.start.getTime() &&
      Date.parse(session.seatedAt) <= today.end.getTime(),
  );
  const durations = completedSessions.map((session) =>
    minutesBetween(session.seatedAt, session.clearedAt as string),
  );
  const longestWaiting = [...waiting].sort(
    (a, b) => Date.parse(a.joinedAt) - Date.parse(b.joinedAt),
  )[0];
  const overdueCleaning = activeTables.filter(
    (table) =>
      table.status === "CLEANING" &&
      minutesBetween(table.statusChangedAt, now.toISOString()) >
        state.restaurant.cleaningTargetMinutes,
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
    estimatedWaitMinutes: estimateCurrentWait(state),
    longestWaiting,
    longestWaitMinutes: longestWaiting
      ? minutesBetween(longestWaiting.joinedAt, now.toISOString())
      : null,
    completedSeatings: completedSessions.length,
    averageDiningMinutes: durations.length
      ? Math.round(average(durations) as number)
      : null,
    overdueCleaning,
  };
}

export interface TableAnalytics {
  tableId: string;
  turns: number;
  occupiedMinutes: number;
  occupancyRate: number | null;
  seatUtilization: number | null;
  averageDiningMinutes: number | null;
  medianDiningMinutes: number | null;
  averageCleaningMinutes: number | null;
  averageIdleMinutes: number | null;
}

export function deriveAnalytics(
  state: DemoState,
  range: AnalyticsRange,
  options: { zone?: string; tableId?: string } = {},
  now = new Date(),
) {
  const tables = state.tables.filter(
    (table) =>
      table.active &&
      (!options.zone || table.zone === options.zone) &&
      (!options.tableId || table.id === options.tableId),
  );
  const tableIds = new Set(tables.map((table) => table.id));
  const sessions = state.sessions.filter(
    (session) =>
      tableIds.has(session.tableId) &&
      Date.parse(session.seatedAt) < range.end.getTime() &&
      sessionEnd(session, now).getTime() > range.start.getTime(),
  );
  const completed = sessions.filter(
    (session) =>
      session.clearedAt &&
      Date.parse(session.seatedAt) >= range.start.getTime() &&
      Date.parse(session.seatedAt) <= range.end.getTime(),
  );
  const diningDurations = completed.map((session) =>
    minutesBetween(session.seatedAt, session.clearedAt as string),
  );
  const cleaningDurations = sessions
    .filter((session) => session.clearedAt && session.readyAt)
    .map((session) =>
      minutesBetween(session.clearedAt as string, session.readyAt as string),
    );
  const occupied = sessions.reduce(
    (sum, session) =>
      sum +
      overlapMinutes(
        new Date(session.seatedAt),
        sessionEnd(session, now),
        range.start,
        range.end,
      ),
    0,
  );
  const openMinutes = operatingMinutes(state, range);
  const capacityByTable = new Map(
    tables.map((table) => [table.id, table.capacity]),
  );
  const utilizationSamples = completed
    .map(
      (session) =>
        session.partySize /
        (capacityByTable.get(session.tableId) ?? session.partySize),
    )
    .filter(Number.isFinite);
  const resolvedQueue = state.queue.filter((entry) => {
    const resolvedAt = entry.seatedAt ?? entry.cancelledAt ?? entry.noShowAt;
    return (
      resolvedAt &&
      Date.parse(resolvedAt) >= range.start.getTime() &&
      Date.parse(resolvedAt) <= range.end.getTime()
    );
  });
  const seatedQueue = resolvedQueue.filter(
    (entry) => entry.status === "SEATED" && entry.seatedAt,
  );
  const queueWaits = seatedQueue.map((entry) =>
    minutesBetween(entry.joinedAt, entry.seatedAt as string),
  );
  const waitErrors = seatedQueue.map(
    (entry) =>
      minutesBetween(entry.joinedAt, entry.seatedAt as string) -
      entry.promisedWaitMinutes,
  );
  const hourCounts = new Map<number, number>();
  for (const session of completed) {
    const restaurantHour = Number(
      restaurantDateParts(session.seatedAt, state.restaurant.timezone).hour,
    );
    hourCounts.set(
      restaurantHour,
      (hourCounts.get(restaurantHour) ?? 0) + 1,
    );
  }
  const busiest = [...hourCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  const tableAnalytics: TableAnalytics[] = tables.map((table) => {
    const tableSessions = sessions.filter(
      (session) => session.tableId === table.id,
    );
    const tableCompleted = tableSessions.filter((session) => session.clearedAt);
    const durations = tableCompleted.map((session) =>
      minutesBetween(session.seatedAt, session.clearedAt as string),
    );
    const cleaning = tableSessions
      .filter((session) => session.clearedAt && session.readyAt)
      .map((session) =>
        minutesBetween(session.clearedAt as string, session.readyAt as string),
      );
    const sorted = [...tableSessions]
      .filter((session) => session.readyAt)
      .sort((a, b) => Date.parse(a.seatedAt) - Date.parse(b.seatedAt));
    const idle: number[] = [];
    for (let index = 1; index < sorted.length; index += 1) {
      const value = minutesBetween(
        sorted[index - 1].readyAt as string,
        sorted[index].seatedAt,
      );
      if (value <= 360) idle.push(value);
    }
    const tableOccupied = tableSessions.reduce(
      (sum, session) =>
        sum +
        overlapMinutes(
          new Date(session.seatedAt),
          sessionEnd(session, now),
          range.start,
          range.end,
        ),
      0,
    );
    return {
      tableId: table.id,
      turns: tableCompleted.length,
      occupiedMinutes: Math.round(tableOccupied),
      occupancyRate: openMinutes
        ? Math.round((tableOccupied / openMinutes) * 100)
        : null,
      seatUtilization: tableCompleted.length
        ? Math.round(
            (average(
              tableCompleted.map(
                (session) => session.partySize / table.capacity,
              ),
            ) as number) * 100,
          )
        : null,
      averageDiningMinutes: durations.length
        ? Math.round(average(durations) as number)
        : null,
      medianDiningMinutes: durations.length
        ? Math.round(median(durations) as number)
        : null,
      averageCleaningMinutes: cleaning.length
        ? Math.round(average(cleaning) as number)
        : null,
      averageIdleMinutes: idle.length
        ? Math.round(average(idle) as number)
        : null,
    };
  });

  return {
    range,
    turns: completed.length,
    occupiedMinutes: Math.round(occupied),
    occupancyRate:
      openMinutes && tables.length
        ? Math.round((occupied / (openMinutes * tables.length)) * 100)
        : null,
    seatUtilization: utilizationSamples.length
      ? Math.round((average(utilizationSamples) as number) * 100)
      : null,
    averageDiningMinutes: diningDurations.length
      ? Math.round(average(diningDurations) as number)
      : null,
    medianDiningMinutes: diningDurations.length
      ? Math.round(median(diningDurations) as number)
      : null,
    averageCleaningMinutes: cleaningDurations.length
      ? Math.round(average(cleaningDurations) as number)
      : null,
    averageQueueWaitMinutes: queueWaits.length
      ? Math.round(average(queueWaits) as number)
      : null,
    promisedWaitBiasMinutes: waitErrors.length
      ? Math.round(average(waitErrors) as number)
      : null,
    promisedWaitMeanAbsoluteError: waitErrors.length
      ? Math.round(average(waitErrors.map(Math.abs)) as number)
      : null,
    abandonmentRate: resolvedQueue.length
      ? Math.round(
          (resolvedQueue.filter((entry) =>
            ["CANCELLED", "NO_SHOW"].includes(entry.status),
          ).length /
            resolvedQueue.length) *
            100,
        )
      : null,
    busiestPeriod: busiest
      ? `${String(busiest[0]).padStart(2, "0")}:00–${String((busiest[0] + 1) % 24).padStart(2, "0")}:00`
      : null,
    tableAnalytics,
    hourlySeatings: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      value: hourCounts.get(hour) ?? 0,
    })),
  };
}

export function deriveInsights(
  state: DemoState,
  analytics: ReturnType<typeof deriveAnalytics>,
) {
  const insights: Array<{ title: string; detail: string; action: string }> = [];
  const cleaningValues = analytics.tableAnalytics
    .map((table) => table.averageCleaningMinutes)
    .filter((value): value is number => value !== null);
  const cleaningMedian = median(cleaningValues);
  const slowCleaning = analytics.tableAnalytics.find(
    (table) =>
      table.averageCleaningMinutes !== null &&
      cleaningMedian !== null &&
      table.averageCleaningMinutes > cleaningMedian * 1.35,
  );
  if (slowCleaning && cleaningMedian !== null) {
    const table = state.tables.find((item) => item.id === slowCleaning.tableId);
    insights.push({
      title: `${table?.label ?? "A table"} has slower cleaning`,
      detail: `${slowCleaning.averageCleaningMinutes} min average versus ${Math.round(cleaningMedian)} min median during ${analytics.range.label.toLowerCase()}.`,
      action: "Review the clearing handoff and cleaning target for this zone.",
    });
  }
  const underused = analytics.tableAnalytics
    .filter((table) => table.seatUtilization !== null)
    .sort(
      (a, b) => (a.seatUtilization as number) - (b.seatUtilization as number),
    )[0];
  if (underused && (underused.seatUtilization as number) < 60) {
    const table = state.tables.find((item) => item.id === underused.tableId);
    insights.push({
      title: `${table?.label ?? "A table"} is under-filled`,
      detail: `${underused.seatUtilization}% seat utilization during ${analytics.range.label.toLowerCase()}.`,
      action: "Prefer smaller tables for small parties when the queue allows.",
    });
  }
  if (
    analytics.promisedWaitBiasMinutes !== null &&
    Math.abs(analytics.promisedWaitBiasMinutes) >= 5
  ) {
    insights.push({
      title: "Promised waits need calibration",
      detail: `Actual waits differ by ${analytics.promisedWaitBiasMinutes} min on average during ${analytics.range.label.toLowerCase()}.`,
      action:
        "Adjust quoted waits using the current queue and available capacity.",
    });
  }
  if (analytics.seatUtilization !== null && analytics.seatUtilization < 65) {
    insights.push({
      title: "Capacity fit is leaving seats unused",
      detail: `Average seat utilization is ${analytics.seatUtilization}% during ${analytics.range.label.toLowerCase()}.`,
      action:
        "Review table recommendations and combine or split floor capacity for common party sizes.",
    });
  }
  if (
    analytics.busiestPeriod &&
    analytics.averageQueueWaitMinutes !== null &&
    analytics.averageQueueWaitMinutes > 20
  ) {
    insights.push({
      title: `${analytics.busiestPeriod} is the main bottleneck`,
      detail: `This is the busiest seating period while queue waits average ${analytics.averageQueueWaitMinutes} min during ${analytics.range.label.toLowerCase()}.`,
      action: "Stage the host and cleaning handoff before this period begins.",
    });
  }
  return insights;
}

export function selectPublicRestaurantState(
  state: DemoState,
  now = new Date(),
) {
  const overview = deriveOverview(state, now);
  const freshnessMinutes = minutesBetween(
    state.lastUpdatedAt,
    now.toISOString(),
  );
  const crowdLevel =
    (overview.occupancyRate ?? 0) >= 75 || overview.queueCount >= 7
      ? "Busy"
      : (overview.occupancyRate ?? 0) >= 40 || overview.queueCount >= 3
        ? "Moderate"
        : "Low";
  return {
    id: state.restaurant.id,
    name: state.restaurant.name,
    location: state.restaurant.location,
    estimatedWaitMinutes: overview.estimatedWaitMinutes,
    groupsWaiting: overview.queueCount,
    availableTables: overview.available,
    activeTables: overview.totalTables,
    crowdLevel,
    walkInStatus: !state.restaurant.isOpen
      ? "Paused"
      : overview.available > 0
        ? "Available"
        : overview.queueCount < 5
          ? "Limited"
          : "Paused",
    lastUpdatedAt: state.lastUpdatedAt,
    stale: freshnessMinutes > 5,
  } as const;
}
