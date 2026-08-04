import { describe, expect, it } from "vitest";
import { migrateDemoState } from "@/components/demo/DemoProvider";
import { createDemoState } from "@/lib/demo/seed";

const now = new Date("2026-08-01T12:00:00+08:00");

describe("browser demo state", () => {
  it("migrates the prior browser shape and fills new manager records", () => {
    const current = createDemoState(now);
    const legacy = {
      version: 1,
      restaurant: {
        id: "old-id",
        name: current.restaurant.name,
        location: current.restaurant.location,
        timezone: "Asia/Manila",
        isOpen: true,
        cleaningTargetMinutes: 12,
      },
      tables: current.tables,
      queue: current.queue,
      sessions: current.sessions,
      events: current.events,
      reservations: current.reservations,
      lastUpdatedAt: current.lastUpdatedAt,
    };
    const migrated = migrateDemoState(legacy);

    expect(migrated?.version).toBe(2);
    expect(migrated?.restaurant.id).toBe("salu-salo");
    expect(migrated?.floorPlans.length).toBeGreaterThan(0);
    expect(migrated?.staff.length).toBeGreaterThan(0);
  });

  it("produces a deterministic reset fixture for a fixed clock", () => {
    expect(createDemoState(now)).toEqual(createDemoState(now));
  });
});
