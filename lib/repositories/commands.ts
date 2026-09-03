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
  | (CommandBase & {
      type: "SEAT_RESERVATION";
      reservationId: string;
      expectedRevision: number;
      tableIds: string[];
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
        | "opensAtHour"
        | "closesAtHour"
      >;
    });

export function newCommandId() {
  return crypto.randomUUID();
}
