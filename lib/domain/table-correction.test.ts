import { describe, expect, it } from "vitest";
import {
  CORRECTION_CLOCK_SKEW_MS,
  CORRECTION_WINDOW_MS,
  correctionReasonFromNote,
  latestTableEvent,
  tableCorrectionEligibility,
} from "./table-correction";

const occurredAt = "2026-09-08T10:00:00.000Z";
const now = Date.parse(occurredAt);
const event = { newStatus: "OCCUPIED" as const, occurredAt };

describe("correction eligibility across manager and staff", () => {
  it("expires immediately after the 15-minute boundary", () => {
    expect(tableCorrectionEligibility("OCCUPIED", event, now + CORRECTION_WINDOW_MS).eligible).toBe(true);
    expect(tableCorrectionEligibility("OCCUPIED", event, now + CORRECTION_WINDOW_MS + 1).eligible).toBe(false);
  });
  it("allows undo right away on a device whose clock runs slightly behind the server", () => {
    // The action was stamped by the server; this device reads a few seconds earlier.
    expect(tableCorrectionEligibility("OCCUPIED", event, now - 3_000).eligible).toBe(true);
    expect(tableCorrectionEligibility("OCCUPIED", event, now - CORRECTION_CLOCK_SKEW_MS).eligible).toBe(true);
    const farBehind = tableCorrectionEligibility("OCCUPIED", event, now - CORRECTION_CLOCK_SKEW_MS - 1);
    expect(farBehind.eligible).toBe(false);
    expect(farBehind.reason).toContain("clock is behind");
  });
  it("rejects missing, far-future, invalid, and mismatched actions", () => {
    expect(tableCorrectionEligibility("OCCUPIED", null, now).eligible).toBe(false);
    expect(tableCorrectionEligibility("OCCUPIED", event, now - CORRECTION_CLOCK_SKEW_MS - 1).eligible).toBe(false);
    expect(tableCorrectionEligibility("OCCUPIED", { ...event, occurredAt: "bad date" }, now).eligible).toBe(false);
    expect(tableCorrectionEligibility("AVAILABLE", event, now).eligible).toBe(false);
  });
  it("does not offer undo for corrections or reservation moves", () => {
    for (const note of ["Correction: tapped by mistake", "Reservation moved from T1"]) {
      expect(tableCorrectionEligibility("OCCUPIED", { ...event, note }, now).eligible).toBe(false);
    }
  });
  it("finds the latest event by time, not by list position", () => {
    // Database mode once delivered oldest-first, so "first" was the oldest event.
    const history = [
      { id: "oldest", occurredAt: "2026-09-08T09:00:00.000Z" },
      { id: "middle", occurredAt: "2026-09-08T09:30:00.000Z" },
      { id: "latest", occurredAt: "2026-09-08T10:00:00.000Z" },
    ];
    expect(latestTableEvent(history)?.id).toBe("latest");
    expect(latestTableEvent([...history].reverse())?.id).toBe("latest");
    expect(latestTableEvent([])).toBeUndefined();
  });
  it("reads the typed reason back out of a correction note only", () => {
    expect(correctionReasonFromNote("Correction: Seated the wrong party")).toBe("Seated the wrong party");
    expect(correctionReasonFromNote("Reservation moved from T1")).toBeNull();
    expect(correctionReasonFromNote("Correction:   ")).toBeNull();
    expect(correctionReasonFromNote(undefined)).toBeNull();
  });
});
