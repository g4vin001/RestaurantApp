import { describe, expect, it } from "vitest";
import { createDemoState } from "@/lib/demo/seed";
import {
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
