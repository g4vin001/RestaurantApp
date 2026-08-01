import { describe, expect, it } from "vitest";
import { deriveOverview, minutesBetween } from "@/lib/domain/analytics";
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
    expect(minutesBetween("2026-08-01T00:00:00Z", "2026-08-01T00:42:00Z")).toBe(42);
  });
});
