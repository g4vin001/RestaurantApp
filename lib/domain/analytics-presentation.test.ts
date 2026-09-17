import { describe, expect, it } from "vitest";
import { formatMetricChange } from "./analytics-presentation";

describe("analytics comparison wording", () => {
  it("treats longer waits as worse and shorter waits as better", () => {
    expect(formatMetricChange(15, 10, "min", true)).toEqual({ text: "Higher by 5 min vs previous", tone: "negative" });
    expect(formatMetricChange(5, 10, "min", true)).toEqual({ text: "Lower by 5 min vs previous", tone: "positive" });
  });
  it("uses percentage points for rates without judging occupancy", () => {
    expect(formatMetricChange(70, 60, "pp")).toEqual({ text: "Higher by 10 pp vs previous", tone: "neutral" });
  });
  it("distinguishes missing samples from real zero values", () => {
    expect(formatMetricChange(null, 10, "min", true)).toBeNull();
    expect(formatMetricChange(0, 0, "turns")?.text).toBe("Unchanged vs previous");
  });
  it("rounds decimal differences for readable comparisons", () => {
    expect(formatMetricChange(0.3, 0.2, "min")?.text).toBe("Higher by 0.1 min vs previous");
  });
});
