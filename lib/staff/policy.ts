import type { StaffPermissionPreset } from "@/lib/domain/types";

export type StaffPermission =
  | "VIEW_LIVE_FLOOR"
  | "CHANGE_TABLE_STATUS"
  | "VIEW_QUEUE"
  | "VIEW_CONTACT_DETAILS"
  | "MANAGE_QUEUE"
  | "SEAT_PARTIES"
  | "CORRECT_RECENT_ACTION";

const ALL_STAFF_PERMISSIONS: readonly StaffPermission[] = [
  "VIEW_LIVE_FLOOR",
  "CHANGE_TABLE_STATUS",
  "VIEW_QUEUE",
  "VIEW_CONTACT_DETAILS",
  "MANAGE_QUEUE",
  "SEAT_PARTIES",
  "CORRECT_RECENT_ACTION",
];

export const STAFF_PERMISSIONS_BY_PRESET: Record<
  StaffPermissionPreset,
  readonly StaffPermission[]
> = {
  // MANAGER here means the highest staff operations preset. It does not grant
  // access to /manager, Team, analytics, settings, or restaurant ownership.
  MANAGER: ALL_STAFF_PERMISSIONS,
  HOST: [
    "VIEW_LIVE_FLOOR",
    "CHANGE_TABLE_STATUS",
    "VIEW_QUEUE",
    "VIEW_CONTACT_DETAILS",
    "MANAGE_QUEUE",
    "SEAT_PARTIES",
  ],
  FLOOR_STAFF: ["VIEW_LIVE_FLOOR", "CHANGE_TABLE_STATUS", "VIEW_QUEUE"],
};

export function normalizeStaffEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidStaffEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeStaffEmail(value));
}

export function permissionsForPreset(preset: StaffPermissionPreset) {
  return STAFF_PERMISSIONS_BY_PRESET[preset];
}

export function hasStaffPermission(
  preset: StaffPermissionPreset,
  permission: StaffPermission,
) {
  return STAFF_PERMISSIONS_BY_PRESET[preset].includes(permission);
}
