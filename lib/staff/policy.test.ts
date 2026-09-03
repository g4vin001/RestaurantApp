import { describe, expect, it } from "vitest";
import {
  hasStaffPermission,
  isValidStaffEmail,
  normalizeStaffEmail,
  permissionsForPreset,
} from "@/lib/staff/policy";

describe("staff work policy", () => {
  it("normalizes the personal Halina email used by the restaurant whitelist", () => {
    expect(normalizeStaffEmail("  Juan.DelaCruz@Example.COM ")).toBe(
      "juan.delacruz@example.com",
    );
    expect(isValidStaffEmail("juan@example.com")).toBe(true);
    expect(isValidStaffEmail("not-an-email")).toBe(false);
  });

  it("keeps floor staff restricted to floor and queue viewing", () => {
    expect(hasStaffPermission("FLOOR_STAFF", "VIEW_LIVE_FLOOR")).toBe(true);
    expect(hasStaffPermission("FLOOR_STAFF", "CHANGE_TABLE_STATUS")).toBe(true);
    expect(hasStaffPermission("FLOOR_STAFF", "VIEW_QUEUE")).toBe(true);
    expect(hasStaffPermission("FLOOR_STAFF", "MANAGE_QUEUE")).toBe(false);
    expect(hasStaffPermission("FLOOR_STAFF", "VIEW_CONTACT_DETAILS")).toBe(false);
  });

  it("allows hosts to manage queue and seating without granting correction", () => {
    expect(hasStaffPermission("HOST", "MANAGE_QUEUE")).toBe(true);
    expect(hasStaffPermission("HOST", "SEAT_PARTIES")).toBe(true);
    expect(hasStaffPermission("HOST", "CORRECT_RECENT_ACTION")).toBe(false);
  });

  it("treats the MANAGER preset as the full operations ceiling only", () => {
    expect(permissionsForPreset("MANAGER")).toEqual(
      expect.arrayContaining([
        "VIEW_LIVE_FLOOR",
        "CHANGE_TABLE_STATUS",
        "VIEW_QUEUE",
        "VIEW_CONTACT_DETAILS",
        "MANAGE_QUEUE",
        "SEAT_PARTIES",
        "CORRECT_RECENT_ACTION",
      ]),
    );
  });
});
