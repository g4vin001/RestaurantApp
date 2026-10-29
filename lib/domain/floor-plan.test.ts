import { describe, expect, it } from "vitest";
import { createDemoState } from "@/lib/demo/seed";
import {
  deleteFloorPlan,
  getActiveFloorVersion,
  publishFloorPlan,
  saveFloorDraft,
  validateFloor,
} from "@/lib/domain/floor-plan";

const now = new Date("2026-08-01T12:00:00+08:00");

describe("floor-plan draft and publish commands", () => {
  it("keeps draft edits out of the active live version", () => {
    const state = createDemoState(now);
    const before = getActiveFloorVersion(state);
    const edited = state.floorPlans[0].draft.elements.map((element) =>
      element.id === "element-table-02"
        ? { ...element, x: element.x + 20 }
        : element,
    );
    const saved = saveFloorDraft(
      state,
      "floor-main",
      "Main floor draft",
      edited,
      now.toISOString(),
    );

    expect(saved.ok).toBe(true);
    expect(getActiveFloorVersion(saved.state!)?.elements).toEqual(
      before?.elements,
    );
    expect(saved.state?.floorPlans[0].draft.elements).toEqual(edited);
  });

  it("publishes an immutable version while preserving stable table status", () => {
    const state = createDemoState(now);
    const edited = state.floorPlans[0].draft.elements.map((element) =>
      element.id === "element-table-02"
        ? { ...element, x: element.x + 20 }
        : element,
    );
    const result = publishFloorPlan(
      state,
      "floor-main",
      "Dinner layout",
      edited,
      new Date(now.getTime() + 60_000).toISOString(),
      "Test manager",
    );

    expect(result.ok).toBe(true);
    expect(result.state?.floorPlans[0].versions).toHaveLength(2);
    expect(
      result.state?.tables.find((table) => table.id === "table-02")?.status,
    ).toBe("AVAILABLE");
    expect(getActiveFloorVersion(result.state!)?.name).toBe("Dinner layout");
    expect(state.floorPlans[0].versions).toHaveLength(1);
  });

  it("blocks duplicate labels and removal of a table with an active session", () => {
    const state = createDemoState(now);
    const duplicated = state.floorPlans[0].draft.elements.map((element) =>
      element.id === "element-table-02" ? { ...element, label: "T1" } : element,
    );
    expect(
      validateFloor(duplicated).some(
        (issue) => issue.code === "DUPLICATE_LABEL" && issue.blocking,
      ),
    ).toBe(true);

    const removedActive = state.floorPlans[0].draft.elements.filter(
      (element) => element.tableId !== "table-01",
    );
    const result = publishFloorPlan(
      state,
      "floor-main",
      "Unsafe removal",
      removedActive,
      now.toISOString(),
      "Test manager",
    );
    expect(result.ok).toBe(false);
    expect(result.errors?.join(" ")).toContain("active session or reservation");
  });
});

describe("multiple live floors", () => {
  const at = now.toISOString();
  // A second, empty floor next to the seeded main floor.
  function withUpstairs() {
    const state = createDemoState(now);
    const upstairs = {
      ...state.floorPlans[0],
      id: "floor-upstairs",
      name: "Upstairs",
      draft: { ...state.floorPlans[0].draft, elements: [] },
      versions: [],
      activeVersionId: null,
    };
    return { ...state, floorPlans: [...state.floorPlans, upstairs] };
  }
  const upstairsTable = (label: string) => ({
    id: `element-${label}`,
    type: "TABLE" as const,
    label,
    tableId: `table-${label}`,
    x: 100, y: 100, width: 120, height: 120, rotation: 0, zIndex: 2,
    locked: false, visible: true, capacity: 4, shape: "SQUARE" as const, zone: "Upstairs",
  });

  it("publishing a second floor keeps the first floor's tables in service", () => {
    const state = withUpstairs();
    const mainTableIds = state.tables.filter((table) => table.active).map((table) => table.id);
    const published = publishFloorPlan(state, "floor-upstairs", "Upstairs", [upstairsTable("U1")], at, "Manager");

    expect(published.ok).toBe(true);
    const active = published.state!.tables.filter((table) => table.active).map((table) => table.id);
    expect(active).toEqual(expect.arrayContaining([...mainTableIds, "table-U1"]));
  });

  it("refuses a table label already used on another live floor", () => {
    const state = withUpstairs();
    const mainLabel = state.tables.find((table) => table.active)!.label;
    const published = publishFloorPlan(state, "floor-upstairs", "Upstairs", [upstairsTable(mainLabel)], at, "Manager");

    expect(published.ok).toBe(false);
    expect(published.errors?.join(" ")).toContain("unique across floors");
  });

  it("deletes a floor and retires its tables, but always keeps one floor", () => {
    const published = publishFloorPlan(withUpstairs(), "floor-upstairs", "Upstairs", [upstairsTable("U1")], at, "Manager");
    const deleted = deleteFloorPlan(published.state!, "floor-upstairs");

    expect(deleted.ok).toBe(true);
    expect(deleted.state!.floorPlans.map((plan) => plan.id)).toEqual(["floor-main"]);
    expect(deleted.state!.tables.find((table) => table.id === "table-U1")?.active).toBe(false);
    expect(deleteFloorPlan(deleted.state!, "floor-main")).toMatchObject({
      ok: false,
      errors: [expect.stringContaining("at least one floor")],
    });
  });

  it("refuses to delete a floor while one of its tables is in use", () => {
    const published = publishFloorPlan(withUpstairs(), "floor-upstairs", "Upstairs", [upstairsTable("U1")], at, "Manager");
    const busy = {
      ...published.state!,
      tables: published.state!.tables.map((table) =>
        table.id === "table-U1" ? { ...table, status: "OCCUPIED" as const } : table,
      ),
    };
    expect(deleteFloorPlan(busy, "floor-upstairs")).toMatchObject({
      ok: false,
      errors: [expect.stringContaining("U1")],
    });
  });
});
