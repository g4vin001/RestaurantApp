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

function latestLinkedQueue(state: DemoState, tableId: string) {
  return state.queue
    .filter(
      (entry) =>
        entry.status === "SEATED" &&
        (entry.assignedTableId === tableId ||
          entry.assignedTableIds?.includes(tableId)),
    )
    .sort(
      (left, right) =>
        Date.parse(right.seatedAt ?? "") - Date.parse(left.seatedAt ?? ""),
    )[0];
}

function latestLinkedReservation(state: DemoState, tableId: string) {
  return state.reservations
    .filter(
      (reservation) =>
        ["SEATED", "COMPLETED"].includes(reservation.status) &&
        (reservation.tableId === tableId ||
          reservation.tableIds?.includes(tableId)),
    )
    .sort(
      (left, right) =>
        Date.parse(right.seatedAt ?? "") - Date.parse(left.seatedAt ?? ""),
    )[0];
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

  const linkedQueue = latestLinkedQueue(state, tableId);
  const linkedReservation = latestLinkedReservation(state, tableId);
  const linkedIds =
    linkedQueue?.assignedTableIds ??
    linkedReservation?.tableIds ??
    (linkedQueue?.assignedTableId
      ? [linkedQueue.assignedTableId]
      : linkedReservation?.tableId
        ? [linkedReservation.tableId]
        : [tableId]);
  const affectedIds =
    table.status === "OCCUPIED" || table.status === "CLEANING"
      ? [...new Set(linkedIds)]
      : [tableId];
  const affectedTables = affectedIds.map((id) =>
    state.tables.find((item) => item.id === id && item.active),
  );
  if (
    affectedTables.some(
      (item) => !item || item.status !== table.status,
    )
  ) {
    return {
      ok: false,
      error: "The linked table group changed and must be refreshed.",
    };
  }

  const sessions = state.sessions.map((session) => {
    if (!affectedIds.includes(session.tableId) || session.readyAt)
      return session;
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
          affectedIds.includes(item.id)
            ? { ...item, status, statusChangedAt: occurredAt }
            : item,
        ),
        sessions,
        events: [
          ...affectedIds.map((affectedId) => ({
            id: `event-${occurredAt}-${affectedId}`,
            tableId: affectedId,
            previousStatus: table.status,
            newStatus: status,
            occurredAt,
            actor,
          })),
          ...state.events,
        ],
      },
      occurredAt,
    ),
  };
}

export function correctLastTableTransition(
  state: DemoState,
  tableId: string,
  reason: string,
  occurredAt: string,
  actor: string,
): DomainResult {
  const table = state.tables.find((item) => item.id === tableId && item.active);
  if (!table)
    return { ok: false, error: "Table was not found on the published floor." };

  const event = state.events.find((item) => item.tableId === tableId);
  if (!event)
    return { ok: false, error: "There is no recent table action to correct." };
  if (event.note?.startsWith("Correction:"))
    return { ok: false, error: "The latest table action is already a correction." };
  if (table.status !== event.newStatus)
    return { ok: false, error: "The table changed again; refresh before correcting it." };

  const correctionReason = reason.trim();
  if (correctionReason.length < 4)
    return { ok: false, error: "Add a short reason for the correction." };
  const ageMinutes =
    (Date.parse(occurredAt) - Date.parse(event.occurredAt)) / 60_000;
  if (ageMinutes > 15)
    return {
      ok: false,
      error: "Only the most recent 15 minutes can be corrected. Use a new status change instead.",
    };

  const seatedQueue = state.queue.find(
    (entry) =>
      entry.status === "SEATED" &&
      entry.seatedAt === event.occurredAt &&
      (entry.assignedTableId === tableId ||
        entry.assignedTableIds?.includes(tableId)),
  );
  const seatedReservation = state.reservations.find(
    (reservation) =>
      reservation.status === "SEATED" &&
      reservation.seatedAt === event.occurredAt &&
      (reservation.tableId === tableId ||
        reservation.tableIds?.includes(tableId)),
  );
  const activeQueue = latestLinkedQueue(state, tableId);
  const activeReservation = latestLinkedReservation(state, tableId);
  const linkedQueue =
    event.newStatus === "OCCUPIED" ? seatedQueue : activeQueue;
  const linkedReservation =
    event.newStatus === "OCCUPIED"
      ? seatedReservation
      : activeReservation;
  const linkedIds =
    linkedQueue?.assignedTableIds ??
    linkedReservation?.tableIds ??
    (linkedQueue?.assignedTableId
      ? [linkedQueue.assignedTableId]
      : linkedReservation?.tableId
        ? [linkedReservation.tableId]
        : [tableId]);
  const affectedIds = [...new Set(linkedIds)];

  const originals = affectedIds.map((id) =>
    state.events.find(
      (item) =>
        item.tableId === id &&
        item.occurredAt === event.occurredAt &&
        item.newStatus === event.newStatus &&
        !item.note?.startsWith("Correction:"),
    ),
  );
  if (originals.some((item) => !item))
    return {
      ok: false,
      error: "The linked table actions no longer match and cannot be corrected safely.",
    };

  let sessions = state.sessions;
  if (event.newStatus === "OCCUPIED") {
    sessions = sessions.filter(
      (session) =>
        !(
          affectedIds.includes(session.tableId) &&
          session.seatedAt === event.occurredAt
        ),
    );
  } else if (
    event.previousStatus === "OCCUPIED" &&
    event.newStatus === "CLEANING"
  ) {
    sessions = sessions.map((session) =>
      affectedIds.includes(session.tableId) &&
      session.clearedAt === event.occurredAt &&
      !session.readyAt
        ? { ...session, clearedAt: undefined }
        : session,
    );
  } else if (
    event.previousStatus === "CLEANING" &&
    event.newStatus === "AVAILABLE"
  ) {
    sessions = sessions.map((session) =>
      affectedIds.includes(session.tableId) &&
      session.readyAt === event.occurredAt
        ? { ...session, readyAt: undefined }
        : session,
    );
  }

  const originalByTable = new Map(
    originals.map((item) => [item!.tableId, item!]),
  );
  const correctionEvents = affectedIds.map((id) => {
    const original = originalByTable.get(id)!;
    return {
      id: `correction-${occurredAt}-${id}`,
      tableId: id,
      previousStatus: original.newStatus,
      newStatus: original.previousStatus,
      occurredAt,
      actor,
      note: `Correction: ${correctionReason}`,
    };
  });

  return {
    ok: true,
    state: touch(
      {
        ...state,
        tables: state.tables.map((item) => {
          const original = originalByTable.get(item.id);
          return original
            ? {
                ...item,
                status: original.previousStatus,
                statusChangedAt: occurredAt,
              }
            : item;
        }),
        sessions,
        queue: state.queue.map((entry) =>
          entry.id === linkedQueue?.id && event.newStatus === "OCCUPIED"
            ? {
                ...entry,
                status: "WAITING" as const,
                seatedAt: undefined,
                assignedTableId: undefined,
                assignedTableIds: undefined,
                updatedAt: occurredAt,
              }
            : entry,
        ),
        reservations: state.reservations.map((reservation) => {
          if (reservation.id !== linkedReservation?.id) return reservation;
          if (event.newStatus === "OCCUPIED") {
            return {
              ...reservation,
              status: reservation.arrivedAt
                ? ("ARRIVED" as const)
                : ("CONFIRMED" as const),
              seatedAt: undefined,
              tableIds: undefined,
              updatedAt: occurredAt,
            };
          }
          if (
            event.previousStatus === "OCCUPIED" &&
            event.newStatus === "CLEANING" &&
            reservation.status === "COMPLETED"
          ) {
            return {
              ...reservation,
              status: "SEATED" as const,
              completedAt: undefined,
              updatedAt: occurredAt,
            };
          }
          return reservation;
        }),
        events: [...correctionEvents, ...state.events],
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
  tableIds: string[];
  combined: boolean;
  capacity: number;
  score: number;
  reason: string;
}

function reservationConflictsWithTable(
  state: DemoState,
  tableId: string,
  now: Date,
) {
  return state.reservations.some(
    (reservation) =>
      (reservation.tableId === tableId ||
        reservation.tableIds?.includes(tableId)) &&
      ["CONFIRMED", "ARRIVED"].includes(reservation.status) &&
      Math.abs(Date.parse(reservation.scheduledAt) - now.getTime()) <
        90 * 60_000,
  );
}

export function recommendTables(
  state: DemoState,
  entry: Pick<QueueEntry, "partySize" | "preferredZone">,
  now = new Date(),
) {
  const available = state.tables.filter(
    (table) => table.active && table.status === "AVAILABLE",
  );
  const singleRecommendations = available
    .filter((table) => table.capacity >= entry.partySize)
    .map<TableRecommendation>((table) => {
      const capacityWaste = table.capacity - entry.partySize;
      const zoneMatch = Boolean(
        entry.preferredZone && table.zone === entry.preferredZone,
      );
      const conflict = reservationConflictsWithTable(state, table.id, now);
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
      return {
        tableId: table.id,
        tableIds: [table.id],
        combined: false,
        capacity: table.capacity,
        score,
        reason: reasons.join(" · "),
      };
    });

  const combinedRecommendations: TableRecommendation[] = [];
  for (let first = 0; first < available.length; first += 1) {
    for (let second = first + 1; second < available.length; second += 1) {
      const tables = [available[first], available[second]];
      if (tables[0].zone !== tables[1].zone) continue;
      const capacity = tables[0].capacity + tables[1].capacity;
      if (capacity < entry.partySize || entry.partySize < 3) continue;
      if (
        tables.some((table) =>
          reservationConflictsWithTable(state, table.id, now),
        )
      )
        continue;
      const capacityWaste = capacity - entry.partySize;
      const zoneMatch = Boolean(
        entry.preferredZone && tables[0].zone === entry.preferredZone,
      );
      const idleMinutes = Math.min(
        ...tables.map((table) =>
          Math.max(
            0,
            Math.floor(
              (now.getTime() - Date.parse(table.statusChangedAt)) / 60_000,
            ),
          ),
        ),
      );
      combinedRecommendations.push({
        tableId: tables[0].id,
        tableIds: tables.map((table) => table.id),
        combined: true,
        capacity,
        score:
          82 -
          capacityWaste * 9 +
          (zoneMatch ? 18 : 0) +
          Math.min(idleMinutes, 20),
        reason: `combine ${tables.map((table) => table.label).join(" + ")} in ${tables[0].zone} · ${capacityWaste} spare ${capacityWaste === 1 ? "seat" : "seats"}`,
      });
    }
  }

  return [...singleRecommendations, ...combinedRecommendations]
    .filter((recommendation) => recommendation.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function estimateWaitForParty(
  state: DemoState,
  partySize: number,
  now = new Date(),
) {
  if (!Number.isFinite(partySize) || partySize < 1) return 0;
  if (recommendTables(state, { partySize }, now).length) return 0;

  const completedDurations = state.sessions
    .filter((session) => session.clearedAt)
    .map(
      (session) =>
        (Date.parse(session.clearedAt!) - Date.parse(session.seatedAt)) /
        60_000,
    )
    .filter((minutes) => minutes > 0 && minutes < 360);
  const averageDiningMinutes = completedDurations.length
    ? completedDurations.reduce((sum, minutes) => sum + minutes, 0) /
      completedDurations.length
    : 60;

  const estimateTable = (table: DemoState["tables"][number]) => {
    const elapsed = Math.max(
      0,
      (now.getTime() - Date.parse(table.statusChangedAt)) / 60_000,
    );
    if (table.status === "AVAILABLE") return 0;
    if (table.status === "CLEANING")
      return Math.max(2, state.restaurant.cleaningTargetMinutes - elapsed);
    if (table.status === "OCCUPIED")
      return Math.max(
        5,
        averageDiningMinutes -
          elapsed +
          state.restaurant.cleaningTargetMinutes,
      );
    if (table.status === "HELD") return 15;
    if (table.status === "RESERVED") return 30;
    return Number.POSITIVE_INFINITY;
  };

  const active = state.tables.filter(
    (table) => table.active && table.status !== "OUT_OF_SERVICE",
  );
  const candidateMinutes: number[] = [];
  active.forEach((table) => {
    if (table.capacity >= partySize) candidateMinutes.push(estimateTable(table));
  });
  for (let first = 0; first < active.length; first += 1) {
    for (let second = first + 1; second < active.length; second += 1) {
      if (
        active[first].zone === active[second].zone &&
        active[first].capacity + active[second].capacity >= partySize
      ) {
        candidateMinutes.push(
          Math.max(estimateTable(active[first]), estimateTable(active[second])),
        );
      }
    }
  }

  const soonest = Math.min(...candidateMinutes);
  if (!Number.isFinite(soonest)) return 120;
  const activeQueue = state.queue.filter((entry) =>
    ["WAITING", "CALLED"].includes(entry.status),
  ).length;
  const throughputMinutes = Math.max(
    4,
    averageDiningMinutes / Math.max(active.length, 1),
  );
  const estimate = soonest + Math.max(0, activeQueue - 1) * throughputMinutes;
  return Math.min(240, Math.max(0, Math.ceil(estimate / 5) * 5));
}

function normalizeTableIds(tableIdOrIds: string | string[]) {
  return [...new Set(Array.isArray(tableIdOrIds) ? tableIdOrIds : [tableIdOrIds])];
}

function allocatePartyAcrossTables(
  tables: DemoState["tables"],
  partySize: number,
) {
  if (partySize < tables.length) return null;
  let remaining = partySize;
  return tables.map((table, index) => {
    const tablesAfter = tables.length - index - 1;
    const allocation = Math.min(table.capacity, remaining - tablesAfter);
    remaining -= allocation;
    return allocation;
  });
}

function seatTables(
  state: DemoState,
  tableIdOrIds: string | string[],
  partySize: number,
  occurredAt: string,
  actor: string,
): DomainResult {
  const tableIds = normalizeTableIds(tableIdOrIds);
  const tables = tableIds
    .map((id) => state.tables.find((table) => table.id === id && table.active))
    .filter((table): table is DemoState["tables"][number] => Boolean(table));
  if (tables.length !== tableIds.length)
    return { ok: false, error: "One or more selected tables were not found." };
  if (tables.some((table) => table.status !== "AVAILABLE"))
    return { ok: false, error: "Every selected table must be available." };
  if (
    tables.length > 1 &&
    !tables.every((table) => table.zone === tables[0].zone)
  )
    return {
      ok: false,
      error: "Combined tables must be in the same floor zone.",
    };
  if (tables.reduce((sum, table) => sum + table.capacity, 0) < partySize)
    return { ok: false, error: "The selected table capacity is too small." };

  const allocations = allocatePartyAcrossTables(tables, partySize);
  if (!allocations)
    return {
      ok: false,
      error: "The party is too small to occupy every selected table.",
    };

  let nextState = state;
  for (let index = 0; index < tables.length; index += 1) {
    const transitioned = transitionTable(
      nextState,
      tables[index].id,
      "OCCUPIED",
      occurredAt,
      actor,
      allocations[index],
    );
    if (!transitioned.ok) return transitioned;
    nextState = transitioned.state;
  }
  return { ok: true, state: nextState };
}

export function seatQueueEntry(
  state: DemoState,
  entryId: string,
  tableIdOrIds: string | string[],
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
  const tableIds = normalizeTableIds(tableIdOrIds);
  const seated = seatTables(
    state,
    tableIds,
    entry.partySize,
    occurredAt,
    actor,
  );
  if (!seated.ok) return seated;
  return {
    ok: true,
    state: touch(
      {
        ...seated.state,
        queue: seated.state.queue.map((item) =>
          item.id === entryId
            ? {
                ...item,
                status: "SEATED",
                seatedAt: occurredAt,
                assignedTableId: tableIds[0],
                assignedTableIds:
                  tableIds.length > 1 ? tableIds : undefined,
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
  status:
    | "CONFIRMED"
    | "ARRIVED"
    | "CANCELLED"
    | "NO_SHOW"
    | "COMPLETED",
  occurredAt: string,
  actor = "Demo manager",
): DomainResult {
  const reservation = state.reservations.find(
    (item) => item.id === reservationId,
  );
  if (!reservation) return { ok: false, error: "Reservation was not found." };
  const allowed: Record<Reservation["status"], Reservation["status"][]> = {
    PENDING_APPROVAL: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["ARRIVED", "CANCELLED", "NO_SHOW"],
    ARRIVED: ["CANCELLED", "NO_SHOW"],
    SEATED: ["COMPLETED"],
    COMPLETED: [],
    CANCELLED: [],
    NO_SHOW: [],
  };
  if (!allowed[reservation.status].includes(status))
    return { ok: false, error: "That reservation action is no longer valid." };
  let nextState = state;
  if (status === "COMPLETED") {
    const tableIds = reservation.tableIds ??
      (reservation.tableId ? [reservation.tableId] : []);
    if (!tableIds.length) {
      return {
        ok: false,
        error: "This seated reservation has no linked table group.",
      };
    }
    const transitioned = transitionTable(
      state,
      tableIds[0],
      "CLEANING",
      occurredAt,
      actor,
    );
    if (!transitioned.ok) return transitioned;
    nextState = transitioned.state;
  }
  return {
    ok: true,
    state: touch(
      {
        ...nextState,
        reservations: nextState.reservations.map((item) =>
          item.id === reservationId
            ? {
                ...item,
                status,
                arrivedAt: status === "ARRIVED" ? occurredAt : item.arrivedAt,
                completedAt:
                  status === "COMPLETED" ? occurredAt : item.completedAt,
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

export function seatReservation(
  state: DemoState,
  reservationId: string,
  tableIdOrIds: string | string[],
  occurredAt: string,
  actor: string,
): DomainResult {
  const reservation = state.reservations.find(
    (item) => item.id === reservationId,
  );
  if (!reservation || !["CONFIRMED", "ARRIVED"].includes(reservation.status))
    return { ok: false, error: "This reservation cannot be seated." };
  const tableIds = normalizeTableIds(tableIdOrIds);
  const seated = seatTables(
    state,
    tableIds,
    reservation.partySize,
    occurredAt,
    actor,
  );
  if (!seated.ok) return seated;
  return {
    ok: true,
    state: touch(
      {
        ...seated.state,
        reservations: seated.state.reservations.map((item) =>
          item.id === reservationId
            ? {
                ...item,
                status: "SEATED",
                tableId: tableIds[0],
                tableIds: tableIds.length > 1 ? tableIds : undefined,
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
  Partial<Pick<StaffMember, "contact" | "email" | "staffRoleId">>;

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
    email: input.email?.trim().toLowerCase() || undefined,
    staffRoleId: input.staffRoleId,
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
                email: input.email?.trim().toLowerCase() || undefined,
                staffRoleId: input.staffRoleId,
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
