import { describe, expect, it } from "vitest";
import {
  deriveAnalytics,
  deriveOverview,
  getAnalyticsRange,
  median,
  minutesBetween,
  overlapMinutes,
  selectPublicRestaurantState,
} from "@/lib/domain/analytics";
import { createDemoState } from "@/lib/demo/seed";
import { legacyOperatingSchedule } from "@/lib/domain/restaurant-schedule";

describe("overview analytics", () => {
  it("derives occupancy and queue counts from canonical state", () => {
    const now = new Date("2026-08-01T12:00:00+08:00");
    const result = deriveOverview(createDemoState(now), now);
    expect(result.totalTables).toBe(10);
    expect(result.occupied).toBe(3);
    expect(result.occupancyRate).toBe(30);
    expect(result.queueCount).toBe(3);
  });

  it("calculates elapsed minutes", () => {
    expect(minutesBetween("2026-08-01T00:00:00Z", "2026-08-01T00:42:00Z")).toBe(
      42,
    );
  });

  it("calculates range analytics from session and queue history", () => {
    const now = new Date("2026-08-01T12:00:00+08:00");
    const state = createDemoState(now);
    const analytics = deriveAnalytics(
      state,
      getAnalyticsRange("LAST_7_DAYS", now),
      {},
      now,
    );

    expect(analytics.turns).toBeGreaterThan(0);
    expect(analytics.occupancyRate).not.toBeNull();
    expect(analytics.averageQueueWaitMinutes).not.toBeNull();
    expect(analytics.promisedWaitMeanAbsoluteError).not.toBeNull();
    expect(analytics.abandonmentRate).not.toBeNull();
    expect(analytics.averageCleaningMinutes).not.toBeNull();
    expect(
      analytics.tableAnalytics.some(
        (table) => table.averageIdleMinutes !== null,
      ),
    ).toBe(true);
    expect(analytics.tableAnalytics).toHaveLength(10);
  });

  it("counts only the overlap inside a selected date range", () => {
    const rangeStart = new Date("2026-08-01T10:00:00Z");
    const rangeEnd = new Date("2026-08-01T11:00:00Z");
    expect(
      overlapMinutes(
        new Date("2026-08-01T09:30:00Z"),
        new Date("2026-08-01T10:20:00Z"),
        rangeStart,
        rangeEnd,
      ),
    ).toBe(20);
  });

  it("uses a true median and exposes only privacy-safe public fields", () => {
    expect(median([60, 10, 20, 90])).toBe(40);
    const state = createDemoState(new Date("2026-08-01T12:00:00+08:00"));
    const publicState = selectPublicRestaurantState(state);

    expect(Object.keys(publicState).sort()).toEqual(
      [
        "activeTables",
        "availableTables",
        "crowdLevel",
        "estimatedWaitMinutes",
        "groupsWaiting",
        "id",
        "lastUpdatedAt",
        "location",
        "name",
        "service",
        "stale",
        "walkInStatus",
      ].sort(),
    );
    expect(JSON.stringify(publicState)).not.toContain("Garcia family");
    expect(Object.keys(publicState.service).sort()).toEqual(["openNow", "statusLabel", "nextChangeAt", "todayHours", "exceptionLabel", "weeklyHours"].sort());
  });

  it("distinguishes a scheduled closure from manually paused walk-ins", () => {
    const now = new Date("2026-09-07T12:00:00+08:00");
    const state = createDemoState(now);
    state.restaurant.isOpen = false;
    expect(selectPublicRestaurantState(state, now).walkInStatus).toBe("Paused");
    state.restaurant.schedule = legacyOperatingSchedule(10, 22);
    state.restaurant.schedule.exceptions = [{ date: "2026-09-07", label: "Holiday", periods: [] }];
    expect(selectPublicRestaurantState(state, now).walkInStatus).toBe("Closed");
  });

  it("excludes breaks from both occupied minutes and the occupancy denominator", () => {
    const start = new Date("2026-09-07T10:00:00+08:00");
    const end = new Date("2026-09-07T18:00:00+08:00");
    const state = createDemoState(end);
    state.tables = state.tables.slice(0, 1);
    state.restaurant.schedule = legacyOperatingSchedule(10, 22);
    state.restaurant.schedule.weekly.monday = [{ opensAt: "10:00", closesAt: "12:00" }, { opensAt: "16:00", closesAt: "18:00" }];
    state.sessions = [{ id: "session", tableId: state.tables[0].id, partySize: 2, seatedAt: start.toISOString(), clearedAt: end.toISOString() }];
    const analytics = deriveAnalytics(state, { start, end, label: "Monday" }, {}, end);
    expect(analytics.occupiedMinutes).toBe(240);
    expect(analytics.occupancyRate).toBe(100);
    expect(analytics.tableAnalytics[0].occupancyRate).toBe(100);
    state.restaurant.schedule.exceptions = [{ date: "2026-09-07", label: "Closed", periods: [] }];
    expect(deriveAnalytics(state, { start, end, label: "Holiday" }, {}, end).occupancyRate).toBeNull();
  });
});
