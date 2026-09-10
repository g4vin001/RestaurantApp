import { describe, expect, it } from "vitest";
import { CUSTOMER_FRESHNESS_MS, customerConnectionStatus, type CustomerConnection } from "./customer-connection";

const now = Date.parse("2026-09-10T10:00:00Z");
const current: CustomerConnection = { online: true, channel: "subscribed", refreshing: false, failed: false, confirmed: true, checkedAt: now };

describe("customer update status", () => {
  it("requires a confirmed response as well as a subscription for a live badge", () => {
    expect(customerConnectionStatus({ ...current, confirmed: false }, now)).toBe("checking");
    expect(customerConnectionStatus(current, now)).toBe("live");
  });
  it("shows offline even if an earlier request or subscription succeeded", () => {
    expect(customerConnectionStatus({ ...current, online: false, refreshing: true }, now)).toBe("offline");
  });
  it("does not mistake periodic successful reads for a healthy live connection", () => {
    expect(customerConnectionStatus({ ...current, channel: "error" }, now)).toBe("periodic");
    expect(customerConnectionStatus({ ...current, channel: "polling" }, now)).toBe("current");
  });
  it("keeps failed updates unconfirmed while a retry is pending", () => {
    expect(customerConnectionStatus({ ...current, failed: true, refreshing: true }, now)).toBe("stale");
  });
  it("expires freshness even if the browser misses a connection event", () => {
    expect(customerConnectionStatus(current, now + CUSTOMER_FRESHNESS_MS + 1)).toBe("stale");
  });
});
