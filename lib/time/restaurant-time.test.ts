import { describe, expect, it } from "vitest";
import {
  DEFAULT_RESTAURANT_TIMEZONE,
  isTimestampStale,
  restaurantDateKey,
  restaurantTimeZone,
  restaurantWallTimeToUtc,
} from "./restaurant-time";

describe("restaurant time helpers", () => {
  it("falls back to Asia/Manila for an invalid timezone", () => {
    expect(restaurantTimeZone("Not/A_Zone")).toBe(DEFAULT_RESTAURANT_TIMEZONE);
  });

  it("formats date boundaries in the restaurant timezone", () => {
    expect(restaurantDateKey("2026-09-01T16:30:00.000Z", "Asia/Manila")).toBe(
      "2026-09-02",
    );
    expect(
      restaurantWallTimeToUtc("2026-09-02T00:30", "Asia/Manila")?.toISOString(),
    ).toBe("2026-09-01T16:30:00.000Z");
  });

  it("ages a timestamp into stale state without a database mutation", () => {
    const updatedAt = "2026-09-02T00:00:00.000Z";
    expect(
      isTimestampStale(updatedAt, new Date("2026-09-02T00:04:59.000Z"), 300_000),
    ).toBe(false);
    expect(
      isTimestampStale(updatedAt, new Date("2026-09-02T00:05:01.000Z"), 300_000),
    ).toBe(true);
  });
});
