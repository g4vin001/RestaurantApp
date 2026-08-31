import type { StaffPermission } from "@/lib/domain/types";

export const STAFF_PERMISSION_CEILING = [
  "VIEW_LIVE_FLOOR",
  "CHANGE_TABLE_STATUS",
  "VIEW_QUEUE",
  "VIEW_CONTACT_DETAILS",
  "MANAGE_QUEUE",
  "SEAT_PARTIES",
  "CORRECT_RECENT_ACTION",
] as const satisfies readonly StaffPermission[];

export const STAFF_ROLE_PRESETS = {
  FLOOR_STAFF: ["VIEW_LIVE_FLOOR", "CHANGE_TABLE_STATUS", "VIEW_QUEUE"],
  HOST: ["VIEW_LIVE_FLOOR", "CHANGE_TABLE_STATUS", "VIEW_QUEUE", "VIEW_CONTACT_DETAILS", "MANAGE_QUEUE", "SEAT_PARTIES"],
  SHIFT_LEAD: [...STAFF_PERMISSION_CEILING],
} as const satisfies Record<string, readonly StaffPermission[]>;

export function sanitizeStaffPermissions(values: readonly string[]) {
  return [...new Set(values)].filter((value): value is StaffPermission =>
    (STAFF_PERMISSION_CEILING as readonly string[]).includes(value),
  );
}

export function staffPermissionDependencyError(
  permissions: readonly StaffPermission[],
) {
  if (!permissions.includes("VIEW_LIVE_FLOOR") && !permissions.includes("VIEW_QUEUE")) {
    return "A staff role must allow Live Floor or Queue viewing.";
  }
  if (
    permissions.some((permission) =>
      ["CHANGE_TABLE_STATUS", "CORRECT_RECENT_ACTION"].includes(permission),
    ) &&
    !permissions.includes("VIEW_LIVE_FLOOR")
  ) {
    return "Table actions require View Live Floor.";
  }
  if (
    permissions.some((permission) =>
      ["VIEW_CONTACT_DETAILS", "MANAGE_QUEUE", "SEAT_PARTIES"].includes(
        permission,
      ),
    ) &&
    !permissions.includes("VIEW_QUEUE")
  ) {
    return "Queue actions and contact details require View Queue.";
  }
  return null;
}

export const STAFF_PERMISSION_LABELS: Record<StaffPermission, string> = {
  VIEW_LIVE_FLOOR: "View Live Floor",
  CHANGE_TABLE_STATUS: "Change table status",
  VIEW_QUEUE: "View Queue",
  VIEW_CONTACT_DETAILS: "View contact details",
  MANAGE_QUEUE: "Add, edit, call, and resolve Queue entries",
  SEAT_PARTIES: "Seat parties",
  CORRECT_RECENT_ACTION: "Correct a recent action",
};
