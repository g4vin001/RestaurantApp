import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateFloorPlanMutation } from "./floor-plan-commands";

function validInput() {
  return {
    planId: randomUUID(),
    name: "Main floor",
    draftRevision: 0,
    elements: [
      {
        id: "new-table-1",
        type: "TABLE",
        x: 120,
        y: 140,
        width: 160,
        height: 140,
        rotation: 0,
        zIndex: 1,
        locked: false,
        visible: true,
        label: "T1",
        zone: "Main dining",
        shape: "SQUARE",
        capacity: 4,
        minPartySize: 1,
        maxPartySize: 4,
      },
    ],
  };
}

describe("floor-plan mutation validation", () => {
  it("accepts a valid editor draft with client-side element IDs", () => {
    expect(validateFloorPlanMutation(validInput())).toMatchObject({
      name: "Main floor",
      draftRevision: 0,
      elements: [{ id: "new-table-1", label: "T1" }],
    });
  });

  it("rejects duplicate element IDs before a database command runs", () => {
    const input = validInput();
    input.elements.push({ ...input.elements[0] });
    expect(() => validateFloorPlanMutation(input)).toThrow(
      "Floor element IDs must be unique.",
    );
  });

  it("rejects malformed table input", () => {
    const input = validInput();
    input.elements[0].capacity = 0;
    expect(() => validateFloorPlanMutation(input)).toThrow(
      "Every table needs a capacity.",
    );
  });
});
