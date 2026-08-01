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
        "stale",
        "walkInStatus",
      ].sort(),
    );
    expect(JSON.stringify(publicState)).not.toContain("Garcia family");
  });
});
