import { describe, expect, it } from "vitest";
import { CORRECTION_WINDOW_MS, tableCorrectionEligibility } from "./table-correction";

const occurredAt = "2026-09-08T10:00:00.000Z";
const now = Date.parse(occurredAt);
const event = { newStatus: "OCCUPIED" as const, occurredAt };

describe("correction eligibility across manager and staff", () => {
  it("expires immediately after the 15-minute boundary", () => {
    expect(tableCorrectionEligibility("OCCUPIED", event, now + CORRECTION_WINDOW_MS).eligible).toBe(true);
    expect(tableCorrectionEligibility("OCCUPIED", event, now + CORRECTION_WINDOW_MS + 1).eligible).toBe(false);
  });
  it("rejects missing, future, invalid, and mismatched actions", () => {
    expect(tableCorrectionEligibility("OCCUPIED", null, now).eligible).toBe(false);
    expect(tableCorrectionEligibility("OCCUPIED", event, now - 1).eligible).toBe(false);
    expect(tableCorrectionEligibility("OCCUPIED", { ...event, occurredAt: "bad date" }, now).eligible).toBe(false);
    expect(tableCorrectionEligibility("AVAILABLE", event, now).eligible).toBe(false);
  });
  it("does not offer undo for corrections or reservation moves", () => {
    for (const note of ["Correction: tapped by mistake", "Reservation moved from T1"]) {
      expect(tableCorrectionEligibility("OCCUPIED", { ...event, note }, now).eligible).toBe(false);
    }
  });
});
