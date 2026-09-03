import type {
  StaffPermission,
  StaffPermissionPreset,
} from "@/lib/domain/types";
import { STAFF_PERMISSION_CEILING } from "@/lib/staff/permissions";

export const STAFF_PERMISSIONS_BY_PRESET: Record<
  StaffPermissionPreset,
  readonly StaffPermission[]
> = {
  // MANAGER here is the widest restricted operations preset. It does not grant
  // /manager, Team, analytics, settings, onboarding, or ownership access.
  MANAGER: STAFF_PERMISSION_CEILING,
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
