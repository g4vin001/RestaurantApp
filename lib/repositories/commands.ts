import type {
  OperationsState,
  RestaurantIdentity,
  StaffPermissionPreset,
  TableStatus,
} from "@/lib/domain/types";

export type CommandFailureCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "CONFLICT"
  | "RESERVATION_CLASH"
  | "OFFLINE"
  | "PERSISTENCE";

export type OperationsCommandResult =
  | { ok: true; state: OperationsState; replayed?: boolean }
  | { ok: false; code: CommandFailureCode; error: string };

type CommandBase = {
  commandId: string;
};

export type QueueCommandInput = {
  partyName: string;
  partySize: number;
  promisedWaitMinutes: number;
  contact?: string;
  notes?: string;
  preferredZone?: string;
};

export type ReservationCommandInput = {
  partyName: string;
  partySize: number;
  scheduledAt: string;
  tableId?: string;
  contact?: string;
  notes?: string;
};

export type StaffCommandInput = {
  name: string;
  jobTitle: string;
  contact?: string;
  email?: string;
  permissionPreset: StaffPermissionPreset;
  staffRoleId?: string;
};

/**
 * Set only after a manager has been shown, and accepted, a RESERVATION_CLASH
 * warning for this exact action. Never default it to true.
 */
type ReservationClashOverride = {
  acknowledgeReservationClash?: boolean;
};

export type DatabaseOperationsCommand =
  | (CommandBase &
      ReservationClashOverride & {
        type: "TRANSITION_TABLE";
        tableId: string;
        expectedRevision: number;
        status: TableStatus;
        partySize?: number;
      })
  | (CommandBase & {
      type: "CORRECT_TABLE";
      tableId: string;
      expectedRevision: number;
      reason: string;
    })
  | (CommandBase & { type: "ADD_QUEUE"; input: QueueCommandInput })
  | (CommandBase & {
      type: "UPDATE_QUEUE";
      entryId: string;
      expectedRevision: number;
      input: QueueCommandInput;
    })
  | (CommandBase & {
      type: "SET_QUEUE_STATUS";
      entryId: string;
      expectedRevision: number;
      status: "CALLED" | "CANCELLED" | "NO_SHOW";
    })
  | (CommandBase &
      ReservationClashOverride & {
        type: "SEAT_QUEUE";
        entryId: string;
        expectedRevision: number;
        tableIds: string[];
      })
  | (CommandBase & {
      type: "REORDER_QUEUE";
      entryId: string;
      expectedRevision: number;
      direction: -1 | 1;
    })
  | (CommandBase & { type: "ADD_RESERVATION"; input: ReservationCommandInput })
  | (CommandBase & {
      type: "UPDATE_RESERVATION";
      reservationId: string;
      expectedRevision: number;
      input: ReservationCommandInput;
    })
  | (CommandBase & {
      type: "SET_RESERVATION_STATUS";
      reservationId: string;
      expectedRevision: number;
      status:
        | "CONFIRMED"
        | "ARRIVED"
        | "CANCELLED"
        | "NO_SHOW"
        | "COMPLETED";
    })
  | (CommandBase &
      ReservationClashOverride & {
        type: "SEAT_RESERVATION";
        reservationId: string;
        expectedRevision: number;
        tableIds: string[];
      })
  | (CommandBase &
      ReservationClashOverride & {
        type: "MOVE_RESERVATION_TABLE";
        reservationId: string;
        expectedRevision: number;
        tableIds: string[];
      })
  | (CommandBase & { type: "ADD_STAFF"; input: StaffCommandInput })
  | (CommandBase & {
      type: "UPDATE_STAFF";
      staffId: string;
      expectedRevision: number;
      input: StaffCommandInput;
    })
  | (CommandBase & {
      type: "SET_STAFF_ACTIVE";
      staffId: string;
      expectedRevision: number;
      active: boolean;
    })
  | (CommandBase & {
      type: "ARCHIVE_STAFF";
      staffId: string;
      expectedRevision: number;
    })
  | (CommandBase & {
      type: "UPDATE_RESTAURANT";
      expectedRevision: number;
      input: Pick<
        RestaurantIdentity,
        | "name"
        | "location"
        | "isOpen"
        | "cleaningTargetMinutes"
        | "reservationDurationMinutes"
        | "acceptsReservations"
        | "reservationBlockedDates"
        | "reservationNotes"
        | "reservationWindows"
        | "opensAtHour"
        | "closesAtHour"
        | "schedule"
      >;
    });

export function newCommandId() {
  // Browsers only provide randomUUID on secure pages (https or localhost), so it
  // is missing when the app is opened over the network, e.g. a phone at
  // http://192.168.x.x:3000. getRandomValues works everywhere; build the same
  // RFC 4122 version-4 UUID from it, which the server's UUID check accepts.
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
