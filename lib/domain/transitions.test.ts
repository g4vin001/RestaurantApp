import { describe, expect, it } from "vitest";
import { canTransitionTable } from "@/lib/domain/transitions";

describe("table transitions", () => {
  it("allows the normal occupied to cleaning workflow", () => {
    expect(canTransitionTable("OCCUPIED", "CLEANING")).toBe(true);
    expect(canTransitionTable("CLEANING", "AVAILABLE")).toBe(true);
  });

  it("rejects an invalid occupied to available shortcut", () => {
    expect(canTransitionTable("OCCUPIED", "AVAILABLE")).toBe(false);
  });
});
