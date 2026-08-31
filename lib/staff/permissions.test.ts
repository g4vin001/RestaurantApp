import { describe, expect, it } from "vitest";
import {
  sanitizeStaffPermissions,
  staffPermissionDependencyError,
  STAFF_ROLE_PRESETS,
} from "./permissions";

describe("staff permission ceiling", () => {
  it("drops manager-only capabilities and duplicates", () => {
    expect(sanitizeStaffPermissions(["VIEW_QUEUE", "ANALYTICS", "VIEW_QUEUE", "SETTINGS"])).toEqual(["VIEW_QUEUE"]);
  });

  it("keeps the Shift Lead preset within restricted operations", () => {
    expect(STAFF_ROLE_PRESETS.SHIFT_LEAD).not.toContain("ANALYTICS");
    expect(STAFF_ROLE_PRESETS.SHIFT_LEAD).toContain("CORRECT_RECENT_ACTION");
  });

  it("requires view permissions before dependent staff actions", () => {
    expect(staffPermissionDependencyError(["MANAGE_QUEUE"])).toContain("Queue");
    expect(
      staffPermissionDependencyError([
        "VIEW_QUEUE",
        "MANAGE_QUEUE",
        "SEAT_PARTIES",
      ]),
    ).toBeNull();
    expect(staffPermissionDependencyError(["CORRECT_RECENT_ACTION"])).toContain(
      "Live Floor",
    );
  });
});
