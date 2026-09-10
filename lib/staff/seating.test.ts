import { describe, expect, it } from "vitest";
import { staffSeatingOptions, staffSeatingTableIds } from "./seating";
import type { SeatingRecommendationState } from "@/lib/domain/operations";

const now = new Date("2026-09-08T10:00:00.000Z");
const table = (id: string, zone = "Main", capacity = 4): SeatingRecommendationState["tables"][number] => ({
  id, label: id, zone, capacity, active: true, status: "AVAILABLE", statusChangedAt: now.toISOString(),
});

describe("staff seating options", () => {
  it("offers a fitting same-zone pair when neither table fits alone", () => {
    const options = staffSeatingOptions({ tables: [table("T1"), table("T2"), table("T3", "Patio")], reservations: [] }, { partySize: 6 }, now);
    expect(options).toEqual([expect.objectContaining({ tableIds: ["T1", "T2"], label: "T1 + T2", capacity: 8, zone: "Main" })]);
  });
  it("removes unavailable tables and never suggests three tables", () => {
    expect(staffSeatingOptions({ tables: [table("T1"), { ...table("T2"), status: "OCCUPIED" }], reservations: [] }, { partySize: 6 }, now)).toEqual([]);
    expect(staffSeatingOptions({ tables: [table("T1"), table("T2"), table("T3")], reservations: [] }, { partySize: 10 }, now)).toEqual([]);
  });
  it("excludes other bookings but lets a reservation use its own table", () => {
    const state: SeatingRecommendationState = { tables: [table("T1")], reservations: [{ id: "booking", tableId: "T1", status: "PENDING_APPROVAL", scheduledAt: new Date(now.getTime() + 30 * 60_000).toISOString() }] };
    expect(staffSeatingOptions(state, { partySize: 2 }, now)).toEqual([]);
    expect(staffSeatingOptions(state, { partySize: 2 }, now, "booking")[0]?.tableIds).toEqual(["T1"]);
  });
  it("blocks a pending booking on either half of a proposed pair", () => {
    const state: SeatingRecommendationState = { tables: [table("T1"), table("T2")], reservations: [{ id: "booking", tableId: "T2", status: "CONFIRMED", scheduledAt: new Date(now.getTime() + 90 * 60_000).toISOString() }] };
    expect(staffSeatingOptions(state, { partySize: 6 }, now)).toEqual([]);
  });
  it("keeps both table IDs in form submissions and accepts older single-table forms", () => {
    const pair = new FormData();
    pair.append("tableIds", "T1"); pair.append("tableIds", "T2");
    pair.append("tableId", "ignore-legacy-when-new-fields-present");
    expect(staffSeatingTableIds(pair)).toEqual(["T1", "T2"]);
    const old = new FormData(); old.set("tableId", "T1");
    expect(staffSeatingTableIds(old)).toEqual(["T1"]);
    expect(staffSeatingTableIds(new FormData())).toEqual([]);
  });
});
