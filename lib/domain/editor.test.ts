import { describe, expect, it } from "vitest";
import {
  commitEditorHistory,
  createEditorHistory,
  moveSelected,
  redoEditorHistory,
  selectElement,
  undoEditorHistory,
} from "@/lib/domain/editor";
import { createDemoState } from "@/lib/demo/seed";

describe("floor editor history", () => {
  it("undoes and redoes immutable element changes", () => {
    const state = createDemoState(new Date("2026-08-01T12:00:00+08:00"));
    const elements = state.floorPlans[0].draft.elements;
    const history = createEditorHistory(elements);
    const moved = moveSelected(elements, ["element-table-02"], 24, 16);
    const committed = commitEditorHistory(history, moved);

    expect(
      committed.present.find((item) => item.id === "element-table-02")?.x,
    ).toBe(364);
    expect(
      undoEditorHistory(committed).present.find(
        (item) => item.id === "element-table-02",
      )?.x,
    ).toBe(340);
    expect(redoEditorHistory(undoEditorHistory(committed)).present).toEqual(
      committed.present,
    );
  });

  it("supports additive selection without duplicates", () => {
    expect(selectElement(["one"], "two", true)).toEqual(["one", "two"]);
    expect(selectElement(["one", "two"], "one", true)).toEqual(["two"]);
    expect(selectElement(["one"], "two", false)).toEqual(["two"]);
  });
});
