import { describe, expect, it } from "vitest";
import { initialStaffConnection, staffConnectionReducer as reduce, staffConnectionStatus as status, type StaffConnectionEvent } from "./staff-connection";

function scenario(...events: StaffConnectionEvent[]) {
  return events.reduce(reduce, initialStaffConnection);
}

describe("staff live connection feedback", () => {
  it("requires a subscription and a fresh server snapshot before claiming live", () => {
    expect(status(scenario({ type: "SUBSCRIBED" }))).toBe("reconnecting");
    expect(status(scenario({ type: "SUBSCRIBED" }, { type: "REFRESH_STARTED", changedElsewhere: false }))).toBe("refreshing");
    expect(status(scenario({ type: "SUBSCRIBED" }, { type: "SNAPSHOT_RECEIVED" }))).toBe("live");
  });
  it("a successful manual refresh cannot disguise a failed live subscription", () => {
    const state = scenario({ type: "CHANNEL_ERROR" }, { type: "REFRESH_STARTED", changedElsewhere: false }, { type: "SNAPSHOT_RECEIVED" });
    expect(status(state)).toBe("reconnecting");
  });
  it("does not let a late refresh response erase offline or closed status", () => {
    expect(status(scenario({ type: "SUBSCRIBED" }, { type: "OFFLINE" }, { type: "SNAPSHOT_RECEIVED" }))).toBe("offline");
    expect(status(scenario({ type: "SUBSCRIBED" }, { type: "CLOSED" }, { type: "SNAPSHOT_RECEIVED" }))).toBe("stale");
  });
  it("requires a new subscription and snapshot after reconnecting", () => {
    const offline = scenario({ type: "SUBSCRIBED" }, { type: "SNAPSHOT_RECEIVED" }, { type: "OFFLINE" });
    const online = reduce(offline, { type: "CONNECTING" });
    expect(status(reduce(online, { type: "SNAPSHOT_RECEIVED" }))).toBe("reconnecting");
    const subscribed = reduce(online, { type: "SUBSCRIBED" });
    expect(status(reduce(subscribed, { type: "SNAPSHOT_RECEIVED" }))).toBe("live");
  });
  it("shows a failed refresh as unconfirmed and can recover on retry", () => {
    const failed = scenario({ type: "SUBSCRIBED" }, { type: "REFRESH_STARTED", changedElsewhere: true }, { type: "REFRESH_FAILED" });
    expect(status(failed)).toBe("stale");
    const retried = reduce(failed, { type: "REFRESH_STARTED", changedElsewhere: true });
    expect(status(reduce(retried, { type: "SNAPSHOT_RECEIVED" }))).toBe("live");
  });
});
