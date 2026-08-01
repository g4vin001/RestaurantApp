import { canTransitionTable } from "@/lib/domain/transitions";
import type {
  DemoState,
  QueueEntry,
  Reservation,
  StaffMember,
  TableStatus,
} from "@/lib/domain/types";

export type DomainResult =
  | { ok: true; state: DemoState }
  | { ok: false; error: string };

function touch(state: DemoState, occurredAt: string): DemoState {
  return { ...state, lastUpdatedAt: occurredAt };
}

export function transitionTable(
  state: DemoState,
  tableId: string,
  status: TableStatus,
  occurredAt: string,
  actor: string,
  partySize?: number,
): DomainResult {
  const table = state.tables.find((item) => item.id === tableId && item.active);
  if (!table)
    return { ok: false, error: "Table was not found on the published floor." };
  if (!canTransitionTable(table.status, status)) {
    return {
      ok: false,
      error: `${table.label} cannot move directly from ${table.status} to ${status}.`,
    };
  }
  if (
    status === "OCCUPIED" &&
    (!partySize || partySize < 1 || partySize > table.capacity)
  ) {
    return {
      ok: false,
      error: `Enter a party size from 1 to ${table.capacity}.`,
    };
  }

  const sessions = state.sessions.map((session) => {
    if (session.tableId !== table.id || session.readyAt) return session;
    if (
      table.status === "OCCUPIED" &&
      status === "CLEANING" &&
      !session.clearedAt
    ) {
      return { ...session, clearedAt: occurredAt };
    }
    if (
      table.status === "CLEANING" &&
      status === "AVAILABLE" &&
      session.clearedAt
    ) {
      return { ...session, readyAt: occurredAt };
    }
    return session;
  });

  if (status === "OCCUPIED") {
    sessions.push({
      id: `session-${occurredAt}-${table.id}`,
      tableId: table.id,
      partySize: partySize as number,
      seatedAt: occurredAt,
    });
  }

  return {
    ok: true,
    state: touch(
      {
        ...state,
        tables: state.tables.map((item) =>
          item.id === table.id
            ? { ...item, status, statusChangedAt: occurredAt }
            : item,
        ),
        sessions,
        events: [
          {
            id: `event-${occurredAt}-${table.id}`,
            tableId: table.id,
            previousStatus: table.status,
            newStatus: status,
            occurredAt,
            actor,
          },
          ...state.events,
        ],
      },
      occurredAt,
    ),
  };
}

export type QueueInput = Pick<
  QueueEntry,
  "partyName" | "partySize" | "promisedWaitMinutes"
> &
  Partial<Pick<QueueEntry, "contact" | "notes" | "preferredZone">>;

export function addQueueEntry(
  state: DemoState,
  input: QueueInput,
  occurredAt: string,
): DomainResult {
  const partyName = input.partyName.trim();
  if (!partyName) return { ok: false, error: "Party name is required." };
  if (
    !Number.isInteger(input.partySize) ||
    input.partySize < 1 ||
    input.partySize > 30
  ) {
    return { ok: false, error: "Party size must be between 1 and 30." };
  }
  if (input.promisedWaitMinutes < 0 || input.promisedWaitMinutes > 240) {
    return {
      ok: false,
      error: "Promised wait must be between 0 and 240 minutes.",
    };
  }
  const entry: QueueEntry = {
    id: `queue-${occurredAt}`,
    partyName,
    partySize: input.partySize,
    promisedWaitMinutes: input.promisedWaitMinutes,
    contact: input.contact?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    preferredZone: input.preferredZone?.trim() || undefined,
    status: "WAITING",
    joinedAt: occurredAt,
    updatedAt: occurredAt,
  };
  return {
    ok: true,
    state: touch({ ...state, queue: [...state.queue, entry] }, occurredAt),
  };
}

export function updateQueueEntry(
  state: DemoState,
  entryId: string,
  input: QueueInput,
  occurredAt: string,
): DomainResult {
  const entry = state.queue.find((item) => item.id === entryId);
  if (!entry) return { ok: false, error: "Queue entry was not found." };
  if (!["WAITING", "CALLED"].includes(entry.status)) {
    return { ok: false, error: "Resolved queue entries cannot be edited." };
  }
  const validated = addQueueEntry(state, input, occurredAt);
  if (!validated.ok) return validated;
  const values = validated.state.queue.at(-1) as QueueEntry;
  return {
    ok: true,
    state: touch(
      {
        ...state,
        queue: state.queue.map((item) =>
          item.id === entryId
            ? {
                ...item,
                ...input,
                partyName: values.partyName,
                contact: values.contact,
                notes: values.notes,
                preferredZone: values.preferredZone,
                updatedAt: occurredAt,
              }
            : item,
        ),
      },
      occurredAt,
    ),
  };
}

export function setQueueStatus(
  state: DemoState,
  entryId: string,
  status: "CALLED" | "CANCELLED" | "NO_SHOW",
  occurredAt: string,
): DomainResult {
  const entry = state.queue.find((item) => item.id === entryId);
  if (!entry) return { ok: false, error: "Queue entry was not found." };
  if (status === "CALLED" && entry.status !== "WAITING")
    return { ok: false, error: "Only a waiting party can be called." };
  if (
    ["CANCELLED", "NO_SHOW"].includes(status) &&
    !["WAITING", "CALLED"].includes(entry.status)
  ) {
    return { ok: false, error: "This party has already been resolved." };
  }
  return {
    ok: true,
    state: touch(
      {
        ...state,
        queue: state.queue.map((item) =>
          item.id === entryId
            ? {
                ...item,
                status,
                calledAt: status === "CALLED" ? occurredAt : item.calledAt,
                cancelledAt:
                  status === "CANCELLED" ? occurredAt : item.cancelledAt,
                noShowAt: status === "NO_SHOW" ? occurredAt : item.noShowAt,
                updatedAt: occurredAt,
              }
            : item,
        ),
      },
      occurredAt,
    ),
  };
}

export interface TableRecommendation {
  tableId: string;
  score: number;
  reason: string;
}

export function recommendTables(
  state: DemoState,
  entry: Pick<QueueEntry, "partySize" | "preferredZone">,
  now = new Date(),
) {
  return state.tables
    .filter(
      (table) =>
        table.active &&
        table.status === "AVAILABLE" &&
        table.capacity >= entry.partySize,
    )
    .map<TableRecommendation>((table) => {
      const capacityWaste = table.capacity - entry.partySize;
      const zoneMatch = Boolean(
        entry.preferredZone && table.zone === entry.preferredZone,
      );
      const conflict = state.reservations.some(
        (reservation) =>
          reservation.tableId === table.id &&
          ["CONFIRMED", "ARRIVED"].includes(reservation.status) &&
          Math.abs(Date.parse(reservation.scheduledAt) - now.getTime()) <
            90 * 60_000,
      );
      const idleMinutes = Math.max(
        0,
        Math.floor(
          (now.getTime() - Date.parse(table.statusChangedAt)) / 60_000,
        ),
      );
      const score =
        100 -
        capacityWaste * 12 +
        (zoneMatch ? 18 : 0) +
        Math.min(idleMinutes, 30) -
        (conflict ? 100 : 0);
      const reasons = [
        `fits ${entry.partySize} guests with ${capacityWaste} spare ${capacityWaste === 1 ? "seat" : "seats"}`,
      ];
      if (zoneMatch) reasons.push(`matches ${table.zone}`);
      if (conflict) reasons.push("has a near-term reservation conflict");
      else reasons.push(`idle for ${idleMinutes} min`);
      return { tableId: table.id, score, reason: reasons.join(" · ") };
    })
    .filter((recommendation) => recommendation.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function seatQueueEntry(
  state: DemoState,
  entryId: string,
  tableId: string,
  occurredAt: string,
  actor: string,
): DomainResult {
  const entry = state.queue.find((item) => item.id === entryId);
  if (!entry || !["WAITING", "CALLED"].includes(entry.status)) {
    return {
      ok: false,
      error: "Only a waiting or called party can be seated.",
    };
  }
  const table = state.tables.find((item) => item.id === tableId && item.active);
  if (!table || table.status !== "AVAILABLE")
    return { ok: false, error: "Choose an available table." };
  if (entry.partySize > table.capacity)
    return { ok: false, error: `${table.label} is too small for this party.` };
  const transitioned = transitionTable(
    state,
    tableId,
    "OCCUPIED",
    occurredAt,
    actor,
    entry.partySize,
  );
  if (!transitioned.ok) return transitioned;
  return {
    ok: true,
    state: touch(
      {
        ...transitioned.state,
        queue: transitioned.state.queue.map((item) =>
          item.id === entryId
            ? {
                ...item,
                status: "SEATED",
                seatedAt: occurredAt,
                assignedTableId: tableId,
                updatedAt: occurredAt,
              }
            : item,
        ),
      },
      occurredAt,
    ),
  };
}

export type ReservationInput = Pick<
  Reservation,
  "partyName" | "partySize" | "scheduledAt"
> &
  Partial<Pick<Reservation, "contact" | "notes" | "tableId">>;

export function reservationConflict(
  state: DemoState,
  input: ReservationInput,
  excludeId?: string,
) {
  if (!input.tableId) return null;
  return (
    state.reservations.find(
      (reservation) =>
        reservation.id !== excludeId &&
        reservation.tableId === input.tableId &&
        ["CONFIRMED", "ARRIVED", "SEATED"].includes(reservation.status) &&
        Math.abs(
          Date.parse(reservation.scheduledAt) - Date.parse(input.scheduledAt),
        ) <
          90 * 60_000,
    ) ?? null
  );
}

export function createReservation(
  state: DemoState,
  input: ReservationInput,
  occurredAt: string,
): DomainResult {
  if (!input.partyName.trim())
    return { ok: false, error: "Party name is required." };
  if (
    !Number.isInteger(input.partySize) ||
    input.partySize < 1 ||
    input.partySize > 30
  )
    return { ok: false, error: "Party size must be between 1 and 30." };
  if (Number.isNaN(Date.parse(input.scheduledAt)))
    return { ok: false, error: "Choose a valid reservation date and time." };
  const table = input.tableId
    ? state.tables.find((item) => item.id === input.tableId && item.active)
    : null;
  if (input.tableId && !table)
    return {
      ok: false,
      error: "Assigned table was not found on the published floor.",
    };
  if (table && input.partySize > table.capacity)
    return { ok: false, error: `${table.label} is too small for this party.` };
  if (reservationConflict(state, input))
    return {
      ok: false,
      error: "That table has another reservation within 90 minutes.",
    };
  const reservation: Reservation = {
    id: `reservation-${occurredAt}`,
    partyName: input.partyName.trim(),
    partySize: input.partySize,
    scheduledAt: input.scheduledAt,
    contact: input.contact?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    tableId: input.tableId || undefined,
    status: "CONFIRMED",
    updatedAt: occurredAt,
  };
  return {
    ok: true,
    state: touch(
      { ...state, reservations: [...state.reservations, reservation] },
      occurredAt,
    ),
  };
}

export function updateReservation(
  state: DemoState,
  reservationId: string,
  input: ReservationInput,
  occurredAt: string,
): DomainResult {
  const reservation = state.reservations.find(
    (item) => item.id === reservationId,
  );
  if (!reservation) return { ok: false, error: "Reservation was not found." };
  const validated = createReservation(state, input, occurredAt);
  if (!validated.ok) {
    if (
      validated.error.includes("another reservation") &&
      !reservationConflict(state, input, reservationId)
    ) {
      // The only conflict was the reservation being edited.
    } else {
      return validated;
    }
  }
  if (reservationConflict(state, input, reservationId))
    return {
      ok: false,
      error: "That table has another reservation within 90 minutes.",
    };
  return {
    ok: true,
    state: touch(
      {
        ...state,
        reservations: state.reservations.map((item) =>
          item.id === reservationId
            ? {
                ...item,
                ...input,
                partyName: input.partyName.trim(),
                contact: input.contact?.trim() || undefined,
                notes: input.notes?.trim() || undefined,
                tableId: input.tableId || undefined,
                updatedAt: occurredAt,
              }
            : item,
        ),
      },
      occurredAt,
    ),
  };
}

export function setReservationStatus(
  state: DemoState,
  reservationId: string,
  status: "ARRIVED" | "CANCELLED" | "NO_SHOW" | "COMPLETED",
  occurredAt: string,
): DomainResult {
  const reservation = state.reservations.find(
    (item) => item.id === reservationId,
  );
  if (!reservation) return { ok: false, error: "Reservation was not found." };
  const allowed: Record<Reservation["status"], Reservation["status"][]> = {
    CONFIRMED: ["ARRIVED", "CANCELLED", "NO_SHOW"],
    ARRIVED: ["CANCELLED", "NO_SHOW"],
    SEATED: ["COMPLETED"],
    COMPLETED: [],
    CANCELLED: [],
    NO_SHOW: [],
  };
  if (!allowed[reservation.status].includes(status))
    return { ok: false, error: "That reservation action is no longer valid." };
  return {
    ok: true,
    state: touch(
      {
        ...state,
        reservations: state.reservations.map((item) =>
          item.id === reservationId
            ? {
                ...item,
                status,
                arrivedAt: status === "ARRIVED" ? occurredAt : item.arrivedAt,
                completedAt:
                  status === "COMPLETED" ? occurredAt : item.completedAt,
                updatedAt: occurredAt,
              }
            : item,
        ),
      },
      occurredAt,
    ),
  };
}

export function seatReservation(
  state: DemoState,
  reservationId: string,
  tableId: string,
  occurredAt: string,
  actor: string,
): DomainResult {
  const reservation = state.reservations.find(
    (item) => item.id === reservationId,
  );
  if (!reservation || !["CONFIRMED", "ARRIVED"].includes(reservation.status))
    return { ok: false, error: "This reservation cannot be seated." };
  const transitioned = transitionTable(
    state,
    tableId,
    "OCCUPIED",
    occurredAt,
    actor,
    reservation.partySize,
  );
  if (!transitioned.ok) return transitioned;
  return {
    ok: true,
    state: touch(
      {
        ...transitioned.state,
        reservations: transitioned.state.reservations.map((item) =>
          item.id === reservationId
            ? {
                ...item,
                status: "SEATED",
                tableId,
                seatedAt: occurredAt,
                updatedAt: occurredAt,
              }
            : item,
        ),
      },
      occurredAt,
    ),
  };
}

export type StaffInput = Pick<
  StaffMember,
  "name" | "jobTitle" | "permissionPreset"
> &
  Partial<Pick<StaffMember, "contact">>;

export function addStaffMember(
  state: DemoState,
  input: StaffInput,
  occurredAt: string,
): DomainResult {
  if (!input.name.trim() || !input.jobTitle.trim())
    return { ok: false, error: "Name and job title are required." };
  const member: StaffMember = {
    id: `staff-${occurredAt}`,
    name: input.name.trim(),
    jobTitle: input.jobTitle.trim(),
    contact: input.contact?.trim() || undefined,
    permissionPreset: input.permissionPreset,
    active: true,
    accessStatus: "NOT_INVITED",
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
  return {
    ok: true,
    state: touch({ ...state, staff: [...state.staff, member] }, occurredAt),
  };
}

export function updateStaffMember(
  state: DemoState,
  staffId: string,
  input: StaffInput,
  occurredAt: string,
): DomainResult {
  if (!state.staff.some((item) => item.id === staffId))
    return { ok: false, error: "Staff member was not found." };
  if (!input.name.trim() || !input.jobTitle.trim())
    return { ok: false, error: "Name and job title are required." };
  return {
    ok: true,
    state: touch(
      {
        ...state,
        staff: state.staff.map((item) =>
          item.id === staffId
            ? {
                ...item,
                name: input.name.trim(),
                jobTitle: input.jobTitle.trim(),
                contact: input.contact?.trim() || undefined,
                permissionPreset: input.permissionPreset,
                updatedAt: occurredAt,
              }
            : item,
        ),
      },
      occurredAt,
    ),
  };
}

export function setStaffActive(
  state: DemoState,
  staffId: string,
  active: boolean,
  occurredAt: string,
): DomainResult {
  if (!state.staff.some((item) => item.id === staffId))
    return { ok: false, error: "Staff member was not found." };
  return {
    ok: true,
    state: touch(
      {
        ...state,
        staff: state.staff.map((item) =>
          item.id === staffId
            ? {
                ...item,
                active,
                accessStatus: active ? item.accessStatus : "ACCESS_DISABLED",
                updatedAt: occurredAt,
              }
            : item,
        ),
      },
      occurredAt,
    ),
  };
}

export function removeStaffMember(
  state: DemoState,
  staffId: string,
  occurredAt: string,
): DomainResult {
  if (!state.staff.some((item) => item.id === staffId))
    return { ok: false, error: "Staff member was not found." };
  return {
    ok: true,
    state: touch(
      { ...state, staff: state.staff.filter((item) => item.id !== staffId) },
      occurredAt,
    ),
  };
}
