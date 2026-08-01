import { describe, expect, it } from "vitest";
import { createDemoState } from "@/lib/demo/seed";
import {
  addQueueEntry,
  addStaffMember,
  createReservation,
  recommendTables,
  removeStaffMember,
  seatQueueEntry,
  setQueueStatus,
  setStaffActive,
  transitionTable,
  updateQueueEntry,
  updateStaffMember,
  type DomainResult,
} from "@/lib/domain/operations";

const now = new Date("2026-08-01T12:00:00+08:00");
const occurredAt = now.toISOString();

function successful(result: DomainResult) {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe("manager operation commands", () => {
  it("requires a real party size when occupying a table", () => {
    const state = createDemoState(now);
    const missing = transitionTable(
      state,
      "table-02",
      "OCCUPIED",
      occurredAt,
      "Manager",
    );
    const valid = transitionTable(
      state,
      "table-02",
      "OCCUPIED",
      occurredAt,
      "Manager",
      2,
    );

    expect(missing.ok).toBe(false);
    expect(valid.ok).toBe(true);
    expect(successful(valid).sessions.at(-1)?.partySize).toBe(2);
  });

  it("creates and resolves queue entries explicitly", () => {
    const state = createDemoState(now);
    const added = addQueueEntry(
      state,
      { partyName: "  Villanueva  ", partySize: 2, promisedWaitMinutes: 15 },
      occurredAt,
    );
    expect(added.ok).toBe(true);
    const addedState = successful(added);
    const entry = addedState.queue.at(-1);
    expect(entry?.partyName).toBe("Villanueva");

    const called = setQueueStatus(addedState, entry!.id, "CALLED", occurredAt);
    const calledState = successful(called);
    const seated = seatQueueEntry(
      calledState,
      entry!.id,
      "table-02",
      occurredAt,
      "Manager",
    );
    expect(seated.ok).toBe(true);
    const seatedState = successful(seated);
    expect(
      seatedState.queue.find((item) => item.id === entry!.id)?.status,
    ).toBe("SEATED");
    expect(
      seatedState.tables.find((table) => table.id === "table-02")?.status,
    ).toBe("OCCUPIED");
  });

  it("edits, cancels, and marks queue records as no-show without double resolving", () => {
    const state = createDemoState(now);
    const edited = updateQueueEntry(
      state,
      "queue-01",
      {
        partyName: "Garcia party",
        partySize: 5,
        promisedWaitMinutes: 30,
        notes: "Needs a high chair",
      },
      occurredAt,
    );
    const editedState = successful(edited);
    expect(
      editedState.queue.find((entry) => entry.id === "queue-01"),
    ).toMatchObject({
      partyName: "Garcia party",
      partySize: 5,
    });

    const cancelled = setQueueStatus(
      editedState,
      "queue-01",
      "CANCELLED",
      occurredAt,
    );
    expect(
      successful(cancelled).queue.find((entry) => entry.id === "queue-01")
        ?.status,
    ).toBe("CANCELLED");
    expect(
      setQueueStatus(successful(cancelled), "queue-01", "NO_SHOW", occurredAt)
        .ok,
    ).toBe(false);
    expect(setQueueStatus(state, "queue-02", "NO_SHOW", occurredAt).ok).toBe(
      true,
    );
  });

  it("recommends a fitting table and rejects reservation conflicts", () => {
    const state = createDemoState(now);
    const withoutReservations = { ...state, reservations: [] };
    const recommendations = recommendTables(
      withoutReservations,
      { partySize: 5, preferredZone: "Family" },
      now,
    );
    expect(recommendations[0]?.tableId).toBe("table-06");

    const conflict = createReservation(
      state,
      {
        partyName: "Second booking",
        partySize: 4,
        scheduledAt: state.reservations[0].scheduledAt,
        tableId: "table-05",
      },
      occurredAt,
    );
    expect(conflict.ok).toBe(false);
    if (conflict.ok) throw new Error("Expected a reservation conflict");
    expect(conflict.error).toContain("within 90 minutes");
  });

  it("adds and deactivates staff without creating login access", () => {
    const state = createDemoState(now);
    const added = addStaffMember(
      state,
      { name: "Lia Ramos", jobTitle: "Host", permissionPreset: "HOST" },
      occurredAt,
    );
    const addedState = successful(added);
    const member = addedState.staff.at(-1);
    expect(member?.accessStatus).toBe("NOT_INVITED");
    const deactivated = setStaffActive(
      addedState,
      member!.id,
      false,
      occurredAt,
    );
    expect(successful(deactivated).staff.at(-1)).toMatchObject({
      active: false,
      accessStatus: "ACCESS_DISABLED",
    });

    const updated = updateStaffMember(
      addedState,
      member!.id,
      { name: "Lia Ramos", jobTitle: "Lead host", permissionPreset: "MANAGER" },
      occurredAt,
    );
    expect(successful(updated).staff.at(-1)?.jobTitle).toBe("Lead host");
    const removed = removeStaffMember(
      successful(updated),
      member!.id,
      occurredAt,
    );
    expect(
      successful(removed).staff.some((item) => item.id === member!.id),
    ).toBe(false);
  });
});
