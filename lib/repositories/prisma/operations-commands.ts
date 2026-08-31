import "server-only";

import { createHash } from "node:crypto";
import type {
  MembershipRole,
  Prisma,
  PrismaClient,
  StaffPermission,
  TableStatus,
} from "@/lib/generated/prisma/client";
import { canTransitionTable } from "@/lib/domain/transitions";
import type { DatabaseOperationsCommand } from "@/lib/repositories/commands";
import { OperationsRepositoryError } from "@/lib/repositories/operations";

const CORRECTION_WINDOW_MS = 15 * 60 * 1_000;
const RESERVATION_CONFLICT_WINDOW_MS = 90 * 60 * 1_000;
const MANAGER_ROLES: MembershipRole[] = ["OWNER", "MANAGER"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type OperationsCommandScope = {
  profileId: string;
  restaurantId: string;
  membershipId: string;
  membershipRole: MembershipRole;
  permissions?: StaffPermission[];
};

function fail(
  code: ConstructorParameters<typeof OperationsRepositoryError>[0],
  message: string,
): never {
  throw new OperationsRepositoryError(code, message);
}

function text(value: unknown, label: string, max: number, required = false) {
  if (typeof value !== "string") {
    if (required) fail("VALIDATION", `${label} is required.`);
    return undefined;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (required && !normalized) fail("VALIDATION", `${label} is required.`);
  if (normalized.length > max) {
    fail("VALIDATION", `${label} must be ${max} characters or fewer.`);
  }
  return normalized || undefined;
}

function integer(value: unknown, label: string, min: number, max: number) {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    fail("VALIDATION", `${label} must be a whole number from ${min} to ${max}.`);
  }
  return Number(value);
}

function requirePermission(
  scope: OperationsCommandScope,
  permission: StaffPermission,
) {
  if (MANAGER_ROLES.includes(scope.membershipRole)) return;
  if (scope.membershipRole !== "STAFF" || !scope.permissions?.includes(permission)) {
    fail("FORBIDDEN", "Your staff role does not allow this action.");
  }
}

function requireManager(scope: OperationsCommandScope) {
  if (!MANAGER_ROLES.includes(scope.membershipRole)) {
    fail("FORBIDDEN", "Only an owner or manager can perform this action.");
  }
}

function validateUuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    fail("VALIDATION", `${label} is invalid.`);
  }
}

function validateQueueInput(input: Extract<DatabaseOperationsCommand, { type: "ADD_QUEUE" }>["input"]) {
  return {
    partyName: text(input.partyName, "Party name", 120, true) as string,
    partySize: integer(input.partySize, "Party size", 1, 100),
    promisedWaitMinutes: integer(input.promisedWaitMinutes, "Promised wait", 0, 240),
    contact: text(input.contact, "Contact", 160),
    notes: text(input.notes, "Notes", 2_000),
    preferredZone: text(input.preferredZone, "Preferred zone", 120),
  };
}

function validateReservationInput(
  input: Extract<DatabaseOperationsCommand, { type: "ADD_RESERVATION" }>["input"],
) {
  const scheduledAt = new Date(input.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) fail("VALIDATION", "Reservation time is invalid.");
  if (input.tableId) validateUuid(input.tableId, "Table ID");
  return {
    partyName: text(input.partyName, "Party name", 120, true) as string,
    partySize: integer(input.partySize, "Party size", 1, 100),
    scheduledAt,
    assignedTableId: input.tableId || null,
    contact: text(input.contact, "Contact", 160),
    notes: text(input.notes, "Notes", 2_000),
  };
}

async function assertReservationTable(
  tx: Prisma.TransactionClient,
  scope: OperationsCommandScope,
  input: ReturnType<typeof validateReservationInput>,
  excludeReservationId?: string,
) {
  if (!input.assignedTableId) return;
  const table = await tx.diningTable.findFirst({
    where: {
      id: input.assignedTableId,
      restaurantId: scope.restaurantId,
      active: true,
      archivedAt: null,
    },
    select: { label: true, capacity: true },
  });
  if (!table) {
    fail("VALIDATION", "Assigned table was not found on this restaurant's published floor.");
  }
  if (input.partySize > table.capacity) {
    fail("VALIDATION", `${table.label} is too small for this party.`);
  }
  const conflict = await tx.reservation.findFirst({
    where: {
      restaurantId: scope.restaurantId,
      assignedTableId: input.assignedTableId,
      ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
      status: {
        in: ["PENDING_APPROVAL", "CONFIRMED", "ARRIVED", "SEATED"],
      },
      scheduledAt: {
        gt: new Date(
          input.scheduledAt.getTime() - RESERVATION_CONFLICT_WINDOW_MS,
        ),
        lt: new Date(
          input.scheduledAt.getTime() + RESERVATION_CONFLICT_WINDOW_MS,
        ),
      },
    },
    select: { id: true },
  });
  if (conflict) {
    fail("VALIDATION", "That table has another reservation within 90 minutes.");
  }
}

function validateStaffInput(input: Extract<DatabaseOperationsCommand, { type: "ADD_STAFF" }>["input"]) {
  const email = text(input.email, "Email", 320)?.toLowerCase();
  if (email && !EMAIL_PATTERN.test(email)) fail("VALIDATION", "Enter a valid staff email.");
  if (!(["MANAGER", "HOST", "FLOOR_STAFF"] as const).includes(input.permissionPreset)) {
    fail("VALIDATION", "Staff permission preset is invalid.");
  }
  if (input.staffRoleId) validateUuid(input.staffRoleId, "Staff role ID");
  return {
    name: text(input.name, "Staff name", 80, true) as string,
    jobTitle: text(input.jobTitle, "Job title", 80, true) as string,
    contact: text(input.contact, "Contact", 160),
    email,
    permissionPreset: input.permissionPreset,
    staffRoleId: input.staffRoleId,
  };
}

function commandEntity(command: DatabaseOperationsCommand) {
  if ("tableId" in command) return ["DiningTable", command.tableId] as const;
  if ("entryId" in command) return ["QueueEntry", command.entryId] as const;
  if ("reservationId" in command) return ["Reservation", command.reservationId] as const;
  if ("staffId" in command) return ["StaffMember", command.staffId] as const;
  return [command.type === "UPDATE_RESTAURANT" ? "Restaurant" : command.type, null] as const;
}

function commandFingerprint(command: DatabaseOperationsCommand) {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}

async function assertScope(
  tx: Prisma.TransactionClient,
  scope: OperationsCommandScope,
) {
  const membership = await tx.restaurantMembership.findFirst({
    where: {
      id: scope.membershipId,
      profileId: scope.profileId,
      restaurantId: scope.restaurantId,
      role: scope.membershipRole,
      active: true,
      restaurant: { archivedAt: null },
    },
    select: { id: true },
  });
  if (!membership) fail("FORBIDDEN", "Your restaurant access is no longer active.");
}

async function activeAssignmentForTable(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  tableId: string,
) {
  return tx.seatingAssignment.findFirst({
    where: {
      restaurantId,
      status: { in: ["ACTIVE", "CLEARING"] },
      tables: { some: { diningTableId: tableId } },
    },
    include: { tables: true },
  });
}

async function changeTables(
  tx: Prisma.TransactionClient,
  scope: OperationsCommandScope,
  tableIds: string[],
  fromStatus: TableStatus,
  toStatus: TableStatus,
  commandId: string,
  reason?: string,
) {
  const now = new Date();
  const changed = await tx.diningTable.updateMany({
    where: {
      id: { in: tableIds },
      restaurantId: scope.restaurantId,
      archivedAt: null,
      active: true,
      currentStatus: fromStatus,
    },
    data: { currentStatus: toStatus, statusRevision: { increment: 1 } },
  });
  if (changed.count !== tableIds.length) {
    fail("CONFLICT", "One of these tables changed on another device. Halina refreshed the floor.");
  }
  await tx.tableStatusEvent.createMany({
    data: tableIds.map((diningTableId) => ({
      restaurantId: scope.restaurantId,
      diningTableId,
      fromStatus,
      toStatus,
      actorProfileId: scope.profileId,
      actorMembershipId: scope.membershipId,
      sourceCommandId: commandId,
      reason,
      occurredAt: now,
    })),
  });
  return now;
}

async function releaseHeldTable(
  tx: Prisma.TransactionClient,
  scope: OperationsCommandScope,
  tableId: string | null,
  commandId: string,
  reason: string,
) {
  if (!tableId) return;
  const table = await tx.diningTable.findFirst({
    where: {
      id: tableId,
      restaurantId: scope.restaurantId,
      archivedAt: null,
      currentStatus: { in: ["HELD", "RESERVED"] },
    },
    select: { id: true, currentStatus: true },
  });
  if (!table) return;
  await changeTables(
    tx,
    scope,
    [table.id],
    table.currentStatus,
    "AVAILABLE",
    commandId,
    reason,
  );
}

async function beginReservationGroupClearing(
  tx: Prisma.TransactionClient,
  scope: OperationsCommandScope,
  reservationId: string,
  commandId: string,
) {
  const assignment = await tx.seatingAssignment.findFirst({
    where: {
      restaurantId: scope.restaurantId,
      reservationId,
      status: "ACTIVE",
    },
    orderBy: { seatedAt: "desc" },
    include: { tables: true },
  });
  if (!assignment) {
    fail(
      "PERSISTENCE",
      "This seated reservation has no active seating group. No table was changed.",
    );
  }
  const tableIds = assignment.tables.map((table) => table.diningTableId);
  if (!tableIds.length) {
    fail(
      "PERSISTENCE",
      "This seated reservation has an empty seating group. No table was changed.",
    );
  }
  const now = await changeTables(
    tx,
    scope,
    tableIds,
    "OCCUPIED",
    "CLEANING",
    commandId,
    "Reservation completed; linked seating group started cleaning",
  );
  await tx.diningSession.updateMany({
    where: {
      restaurantId: scope.restaurantId,
      seatingAssignmentId: assignment.id,
      status: "ACTIVE",
    },
    data: {
      status: "CLEANING",
      clearedAt: now,
      cleaningStartedAt: now,
    },
  });
  await tx.seatingAssignment.update({
    where: { id: assignment.id },
    data: { status: "CLEARING" },
  });
  return now;
}

async function transitionTable(
  tx: Prisma.TransactionClient,
  scope: OperationsCommandScope,
  command: Extract<DatabaseOperationsCommand, { type: "TRANSITION_TABLE" }>,
) {
  requirePermission(scope, "CHANGE_TABLE_STATUS");
  validateUuid(command.tableId, "Table ID");
  const table = await tx.diningTable.findFirst({
    where: { id: command.tableId, restaurantId: scope.restaurantId, active: true, archivedAt: null },
  });
  if (!table) fail("VALIDATION", "Table was not found on the published floor.");
  if (table.statusRevision !== command.expectedRevision) {
    fail("CONFLICT", "This table was changed on another device. Halina refreshed it.");
  }
  if (!canTransitionTable(table.currentStatus, command.status)) {
    fail("VALIDATION", `${table.label} cannot move directly from ${table.currentStatus} to ${command.status}.`);
  }
  const assignment = await activeAssignmentForTable(tx, scope.restaurantId, table.id);
  const tableIds = assignment?.tables.map((item) => item.diningTableId) ?? [table.id];
  const now = await changeTables(
    tx,
    scope,
    tableIds,
    table.currentStatus,
    command.status,
    command.commandId,
    assignment ? "Updated linked seating group" : undefined,
  );

  if (command.status === "OCCUPIED") {
    const partySize = integer(command.partySize, "Party size", 1, tableIds.length === 1 ? table.capacity : 100);
    const createdAssignment = await tx.seatingAssignment.create({
      data: { restaurantId: scope.restaurantId, partySize, seatedAt: now },
    });
    for (const diningTableId of tableIds) {
      const session = await tx.diningSession.create({
        data: {
          restaurantId: scope.restaurantId,
          diningTableId,
          seatingAssignmentId: createdAssignment.id,
          partySize,
          seatedAt: now,
        },
      });
      await tx.seatingAssignmentTable.create({
        data: { seatingAssignmentId: createdAssignment.id, diningTableId, diningSessionId: session.id },
      });
    }
  } else if (table.currentStatus === "OCCUPIED" && command.status === "CLEANING") {
    await tx.diningSession.updateMany({
      where: { restaurantId: scope.restaurantId, diningTableId: { in: tableIds }, status: "ACTIVE" },
      data: { status: "CLEANING", clearedAt: now, cleaningStartedAt: now },
    });
    if (assignment) {
      await tx.seatingAssignment.update({ where: { id: assignment.id }, data: { status: "CLEARING" } });
    }
  } else if (table.currentStatus === "CLEANING" && command.status === "AVAILABLE") {
    await tx.diningSession.updateMany({
      where: { restaurantId: scope.restaurantId, diningTableId: { in: tableIds }, status: "CLEANING" },
      data: { status: "COMPLETED", availableAt: now, completedAt: now },
    });
    if (assignment) {
      await tx.seatingAssignment.update({
        where: { id: assignment.id },
        data: { status: "COMPLETED", completedAt: now },
      });
    }
  }
}

async function correctTable(
  tx: Prisma.TransactionClient,
  scope: OperationsCommandScope,
  command: Extract<DatabaseOperationsCommand, { type: "CORRECT_TABLE" }>,
) {
  requirePermission(scope, "CORRECT_RECENT_ACTION");
  const reason = text(command.reason, "Correction reason", 500, true) as string;
  const table = await tx.diningTable.findFirst({
    where: { id: command.tableId, restaurantId: scope.restaurantId, archivedAt: null },
  });
  if (!table) fail("VALIDATION", "Table was not found.");
  if (table.statusRevision !== command.expectedRevision) fail("CONFLICT", "This table changed on another device.");
  const latest = await tx.tableStatusEvent.findFirst({
    where: { restaurantId: scope.restaurantId, diningTableId: table.id },
    orderBy: { occurredAt: "desc" },
  });
  if (!latest || Date.now() - latest.occurredAt.getTime() > CORRECTION_WINDOW_MS) {
    fail("VALIDATION", "Only the latest table action can be corrected within 15 minutes.");
  }
  if (latest.reason?.startsWith("Correction:")) {
    fail(
      "VALIDATION",
      "A correction cannot be corrected again. Use a deliberate new table status change.",
    );
  }
  if (latest.toStatus !== table.currentStatus) fail("CONFLICT", "The latest table action no longer matches the table.");
  let assignment = await activeAssignmentForTable(
    tx,
    scope.restaurantId,
    table.id,
  );
  if (
    !assignment &&
    latest.fromStatus === "CLEANING" &&
    latest.toStatus === "AVAILABLE"
  ) {
    assignment = await tx.seatingAssignment.findFirst({
      where: {
        restaurantId: scope.restaurantId,
        status: "COMPLETED",
        tables: { some: { diningTableId: table.id } },
      },
      orderBy: { seatedAt: "desc" },
      include: { tables: true },
    });
  }
  const tableIds = assignment?.tables.map((item) => item.diningTableId) ?? [table.id];
  const now = await changeTables(
    tx,
    scope,
    tableIds,
    latest.toStatus,
    latest.fromStatus,
    command.commandId,
    `Correction: ${reason}`,
  );
  if (assignment && latest.toStatus === "OCCUPIED") {
    await tx.seatingAssignmentTable.deleteMany({ where: { seatingAssignmentId: assignment.id } });
    await tx.diningSession.deleteMany({ where: { seatingAssignmentId: assignment.id } });
    await tx.seatingAssignment.update({ where: { id: assignment.id }, data: { status: "CORRECTED", completedAt: now } });
    if (assignment.queueEntryId) {
      await tx.queueEntry.update({
        where: { id: assignment.queueEntryId },
        data: { status: "WAITING", seatedAt: null, assignedTableId: null, revision: { increment: 1 } },
      });
    }
    if (assignment.reservationId) {
      await tx.reservation.update({
        where: { id: assignment.reservationId },
        data: { status: "ARRIVED", seatedAt: null, assignedTableId: null, revision: { increment: 1 } },
      });
    }
  } else if (
    assignment &&
    latest.fromStatus === "OCCUPIED" &&
    latest.toStatus === "CLEANING"
  ) {
    await tx.diningSession.updateMany({
      where: {
        restaurantId: scope.restaurantId,
        seatingAssignmentId: assignment.id,
        status: "CLEANING",
      },
      data: {
        status: "ACTIVE",
        clearedAt: null,
        cleaningStartedAt: null,
        availableAt: null,
        completedAt: null,
      },
    });
    await tx.seatingAssignment.update({
      where: { id: assignment.id },
      data: { status: "ACTIVE", completedAt: null },
    });
    if (assignment.reservationId) {
      await tx.reservation.updateMany({
        where: {
          id: assignment.reservationId,
          restaurantId: scope.restaurantId,
          status: "COMPLETED",
        },
        data: {
          status: "SEATED",
          completedAt: null,
          revision: { increment: 1 },
        },
      });
    }
  } else if (
    assignment &&
    latest.fromStatus === "CLEANING" &&
    latest.toStatus === "AVAILABLE"
  ) {
    await tx.diningSession.updateMany({
      where: {
        restaurantId: scope.restaurantId,
        seatingAssignmentId: assignment.id,
        status: "COMPLETED",
      },
      data: {
        status: "CLEANING",
        availableAt: null,
        completedAt: null,
      },
    });
    await tx.seatingAssignment.update({
      where: { id: assignment.id },
      data: { status: "CLEARING", completedAt: null },
    });
  }
}

async function seatSource(
  tx: Prisma.TransactionClient,
  scope: OperationsCommandScope,
  commandId: string,
  source: { kind: "queue"; id: string; expectedRevision: number } | { kind: "reservation"; id: string; expectedRevision: number },
  rawTableIds: string[],
) {
  requirePermission(scope, "SEAT_PARTIES");
  const tableIds = [...new Set(rawTableIds)];
  if (tableIds.length < 1 || tableIds.length > 2) fail("VALIDATION", "Select one table or a same-zone pair.");
  tableIds.forEach((id) => validateUuid(id, "Table ID"));
  const tables = await tx.diningTable.findMany({
    where: { id: { in: tableIds }, restaurantId: scope.restaurantId, active: true, archivedAt: null },
    orderBy: { id: "asc" },
  });
  if (tables.length !== tableIds.length) fail("VALIDATION", "One of the selected tables was not found.");
  if (tables.some((table) => table.currentStatus !== "AVAILABLE")) {
    fail("CONFLICT", "One of these tables was changed on another device.");
  }
  if (new Set(tables.map((table) => table.zone)).size > 1) {
    fail("VALIDATION", "Combined tables must be in the same zone.");
  }

  const now = new Date();
  let partySize: number;
  let queueEntryId: string | undefined;
  let reservationId: string | undefined;
  if (source.kind === "queue") {
    const entry = await tx.queueEntry.findFirst({ where: { id: source.id, restaurantId: scope.restaurantId } });
    if (!entry) fail("VALIDATION", "Queue entry was not found.");
    if (entry.revision !== source.expectedRevision || !["WAITING", "CALLED"].includes(entry.status)) {
      fail("CONFLICT", "This queue entry changed on another device.");
    }
    partySize = entry.partySize;
    queueEntryId = entry.id;
    const changed = await tx.queueEntry.updateMany({
      where: { id: entry.id, restaurantId: scope.restaurantId, revision: source.expectedRevision, status: { in: ["WAITING", "CALLED"] } },
      data: { status: "SEATED", seatedAt: now, assignedTableId: tables[0].id, revision: { increment: 1 } },
    });
    if (changed.count !== 1) fail("CONFLICT", "This queue entry was seated on another device.");
  } else {
    const reservation = await tx.reservation.findFirst({ where: { id: source.id, restaurantId: scope.restaurantId } });
    if (!reservation) fail("VALIDATION", "Reservation was not found.");
    if (reservation.revision !== source.expectedRevision || !["CONFIRMED", "ARRIVED"].includes(reservation.status)) {
      fail("CONFLICT", "This reservation changed on another device.");
    }
    partySize = reservation.partySize;
    reservationId = reservation.id;
    const changed = await tx.reservation.updateMany({
      where: { id: reservation.id, restaurantId: scope.restaurantId, revision: source.expectedRevision, status: { in: ["CONFIRMED", "ARRIVED"] } },
      data: { status: "SEATED", seatedAt: now, assignedTableId: tables[0].id, revision: { increment: 1 } },
    });
    if (changed.count !== 1) fail("CONFLICT", "This reservation was seated on another device.");
  }
  if (tables.reduce((sum, table) => sum + table.capacity, 0) < partySize) {
    fail("VALIDATION", "The selected table capacity is too small for this party.");
  }

  const assignment = await tx.seatingAssignment.create({
    data: { restaurantId: scope.restaurantId, queueEntryId, reservationId, partySize, seatedAt: now },
  });
  await changeTables(tx, scope, tables.map((table) => table.id), "AVAILABLE", "OCCUPIED", commandId, "Party seated");
  for (const table of tables) {
    const session = await tx.diningSession.create({
      data: {
        restaurantId: scope.restaurantId,
        diningTableId: table.id,
        queueEntryId,
        reservationId,
        seatingAssignmentId: assignment.id,
        partySize,
        seatedAt: now,
      },
    });
    await tx.seatingAssignmentTable.create({
      data: { seatingAssignmentId: assignment.id, diningTableId: table.id, diningSessionId: session.id },
    });
  }
}

async function executeInTransaction(
  tx: Prisma.TransactionClient,
  scope: OperationsCommandScope,
  command: DatabaseOperationsCommand,
) {
  await assertScope(tx, scope);
  const replay = await tx.operationCommand.findUnique({ where: { id: command.commandId } });
  if (replay) {
    const result =
      replay.result && typeof replay.result === "object" && !Array.isArray(replay.result)
        ? replay.result
        : null;
    if (
      replay.restaurantId !== scope.restaurantId ||
      replay.actorMembershipId !== scope.membershipId ||
      replay.commandType !== command.type ||
      result?.fingerprint !== commandFingerprint(command)
    ) {
      fail("CONFLICT", "This command identifier was already used.");
    }
    return;
  }

  switch (command.type) {
    case "TRANSITION_TABLE":
      await transitionTable(tx, scope, command);
      break;
    case "CORRECT_TABLE":
      await correctTable(tx, scope, command);
      break;
    case "ADD_QUEUE": {
      requirePermission(scope, "MANAGE_QUEUE");
      const input = validateQueueInput(command.input);
      const aggregate = await tx.queueEntry.aggregate({
        where: { restaurantId: scope.restaurantId, status: { in: ["WAITING", "CALLED"] } },
        _max: { position: true },
      });
      await tx.queueEntry.create({
        data: {
          restaurantId: scope.restaurantId,
          createdById: scope.profileId,
          source: "MANAGER",
          position: (aggregate._max.position ?? -1) + 1,
          ...input,
        },
      });
      break;
    }
    case "UPDATE_QUEUE": {
      requirePermission(scope, "MANAGE_QUEUE");
      const input = validateQueueInput(command.input);
      const changed = await tx.queueEntry.updateMany({
        where: { id: command.entryId, restaurantId: scope.restaurantId, revision: command.expectedRevision, status: { in: ["WAITING", "CALLED"] } },
        data: { ...input, revision: { increment: 1 } },
      });
      if (changed.count !== 1) fail("CONFLICT", "This queue entry changed on another device.");
      break;
    }
    case "SET_QUEUE_STATUS": {
      requirePermission(scope, "MANAGE_QUEUE");
      const now = new Date();
      const allowed = command.status === "CALLED" ? ["WAITING" as const] : ["WAITING" as const, "CALLED" as const];
      const entry = await tx.queueEntry.findFirst({
        where: {
          id: command.entryId,
          restaurantId: scope.restaurantId,
          revision: command.expectedRevision,
          status: { in: allowed },
        },
        select: { assignedTableId: true },
      });
      if (!entry) fail("CONFLICT", "This queue entry changed on another device.");
      const changed = await tx.queueEntry.updateMany({
        where: { id: command.entryId, restaurantId: scope.restaurantId, revision: command.expectedRevision, status: { in: allowed } },
        data: {
          status: command.status,
          calledAt: command.status === "CALLED" ? now : undefined,
          cancelledAt: command.status === "CANCELLED" ? now : undefined,
          noShowAt: command.status === "NO_SHOW" ? now : undefined,
          assignedTableId:
            command.status === "CANCELLED" || command.status === "NO_SHOW"
              ? null
              : undefined,
          revision: { increment: 1 },
        },
      });
      if (changed.count !== 1) fail("CONFLICT", "This queue entry changed on another device.");
      if (command.status === "CANCELLED" || command.status === "NO_SHOW") {
        await releaseHeldTable(
          tx,
          scope,
          entry.assignedTableId,
          command.commandId,
          `Queue entry marked ${command.status.toLowerCase()}`,
        );
      }
      break;
    }
    case "SEAT_QUEUE":
      await seatSource(tx, scope, command.commandId, { kind: "queue", id: command.entryId, expectedRevision: command.expectedRevision }, command.tableIds);
      break;
    case "REORDER_QUEUE": {
      requirePermission(scope, "MANAGE_QUEUE");
      const active = await tx.queueEntry.findMany({
        where: { restaurantId: scope.restaurantId, status: { in: ["WAITING", "CALLED"] } },
        orderBy: [{ position: "asc" }, { joinedAt: "asc" }],
        select: { id: true, position: true, revision: true },
      });
      const index = active.findIndex((entry) => entry.id === command.entryId);
      const target = active[index + command.direction];
      const entry = active[index];
      if (!entry || entry.revision !== command.expectedRevision || !target) {
        fail("CONFLICT", "The queue order changed on another device.");
      }
      await tx.queueEntry.update({ where: { id: entry.id }, data: { position: target.position, revision: { increment: 1 } } });
      await tx.queueEntry.update({ where: { id: target.id }, data: { position: entry.position, revision: { increment: 1 } } });
      break;
    }
    case "ADD_RESERVATION": {
      requireManager(scope);
      const input = validateReservationInput(command.input);
      await assertReservationTable(tx, scope, input);
      await tx.reservation.create({ data: { restaurantId: scope.restaurantId, createdById: scope.profileId, ...input } });
      break;
    }
    case "UPDATE_RESERVATION": {
      requireManager(scope);
      const input = validateReservationInput(command.input);
      await assertReservationTable(tx, scope, input, command.reservationId);
      const changed = await tx.reservation.updateMany({
        where: { id: command.reservationId, restaurantId: scope.restaurantId, revision: command.expectedRevision, status: { in: ["PENDING_APPROVAL", "CONFIRMED", "ARRIVED"] } },
        data: { ...input, revision: { increment: 1 } },
      });
      if (changed.count !== 1) fail("CONFLICT", "This reservation changed on another device.");
      break;
    }
    case "SET_RESERVATION_STATUS": {
      requireManager(scope);
      const allowed = command.status === "ARRIVED" ? ["CONFIRMED" as const] : command.status === "COMPLETED" ? ["SEATED" as const] : ["PENDING_APPROVAL" as const, "CONFIRMED" as const, "ARRIVED" as const];
      const reservation = await tx.reservation.findFirst({
        where: {
          id: command.reservationId,
          restaurantId: scope.restaurantId,
          revision: command.expectedRevision,
          status: { in: allowed },
        },
        select: { assignedTableId: true },
      });
      if (!reservation) fail("CONFLICT", "This reservation changed on another device.");
      const now =
        command.status === "COMPLETED"
          ? await beginReservationGroupClearing(
              tx,
              scope,
              command.reservationId,
              command.commandId,
            )
          : new Date();
      const changed = await tx.reservation.updateMany({
        where: { id: command.reservationId, restaurantId: scope.restaurantId, revision: command.expectedRevision, status: { in: allowed } },
        data: {
          status: command.status,
          arrivedAt: command.status === "ARRIVED" ? now : undefined,
          completedAt: command.status === "COMPLETED" ? now : undefined,
          cancelledAt: command.status === "CANCELLED" ? now : undefined,
          noShowAt: command.status === "NO_SHOW" ? now : undefined,
          assignedTableId:
            command.status === "CANCELLED" || command.status === "NO_SHOW"
              ? null
              : undefined,
          revision: { increment: 1 },
        },
      });
      if (changed.count !== 1) fail("CONFLICT", "This reservation changed on another device.");
      if (command.status === "CANCELLED" || command.status === "NO_SHOW") {
        await releaseHeldTable(
          tx,
          scope,
          reservation.assignedTableId,
          command.commandId,
          `Reservation marked ${command.status.toLowerCase()}`,
        );
      }
      break;
    }
    case "SEAT_RESERVATION":
      await seatSource(tx, scope, command.commandId, { kind: "reservation", id: command.reservationId, expectedRevision: command.expectedRevision }, command.tableIds);
      break;
    case "ADD_STAFF": {
      requireManager(scope);
      const input = validateStaffInput(command.input);
      const role = input.staffRoleId
        ? await tx.staffRole.findFirst({ where: { id: input.staffRoleId, restaurantId: scope.restaurantId, archivedAt: null } })
        : await tx.staffRole.findFirst({ where: { restaurantId: scope.restaurantId, presetKey: input.permissionPreset === "MANAGER" ? "SHIFT_LEAD" : input.permissionPreset, archivedAt: null } });
      if (!role) fail("VALIDATION", "Select a valid staff role.");
      await tx.staffMember.create({ data: { restaurantId: scope.restaurantId, ...input, staffRoleId: role.id } });
      break;
    }
    case "UPDATE_STAFF": {
      requireManager(scope);
      const input = validateStaffInput(command.input);
      const role = input.staffRoleId
        ? await tx.staffRole.findFirst({
            where: {
              id: input.staffRoleId,
              restaurantId: scope.restaurantId,
              archivedAt: null,
            },
          })
        : await tx.staffRole.findFirst({
            where: {
              restaurantId: scope.restaurantId,
              presetKey:
                input.permissionPreset === "MANAGER"
                  ? "SHIFT_LEAD"
                  : input.permissionPreset,
              archivedAt: null,
            },
          });
      if (!role) fail("VALIDATION", "Select a valid staff role.");
      const changed = await tx.staffMember.updateMany({
        where: { id: command.staffId, restaurantId: scope.restaurantId, revision: command.expectedRevision, archivedAt: null },
        data: { ...input, staffRoleId: role.id, revision: { increment: 1 } },
      });
      if (changed.count !== 1) fail("CONFLICT", "This staff record changed on another device.");
      break;
    }
    case "SET_STAFF_ACTIVE": {
      requireManager(scope);
      const staff = await tx.staffMember.findFirst({
        where: {
          id: command.staffId,
          restaurantId: scope.restaurantId,
          revision: command.expectedRevision,
          archivedAt: null,
        },
        select: { membershipId: true, accessStatus: true },
      });
      if (!staff) fail("CONFLICT", "This staff record changed on another device.");
      const changed = await tx.staffMember.updateMany({
        where: { id: command.staffId, restaurantId: scope.restaurantId, revision: command.expectedRevision, archivedAt: null },
        data: {
          active: command.active,
          accessStatus: command.active
            ? staff.membershipId
              ? "ACTIVE"
              : undefined
            : "ACCESS_DISABLED",
          revision: { increment: 1 },
        },
      });
      if (changed.count !== 1) fail("CONFLICT", "This staff record changed on another device.");
      if (staff.membershipId) {
        await tx.restaurantMembership.update({
          where: { id: staff.membershipId },
          data: {
            active: command.active,
          },
        });
      }
      break;
    }
    case "ARCHIVE_STAFF": {
      requireManager(scope);
      const now = new Date();
      const changed = await tx.staffMember.updateMany({
        where: { id: command.staffId, restaurantId: scope.restaurantId, revision: command.expectedRevision, archivedAt: null },
        data: { active: false, accessStatus: "ACCESS_DISABLED", archivedAt: now, revision: { increment: 1 } },
      });
      if (changed.count !== 1) fail("CONFLICT", "This staff record changed on another device.");
      await tx.staffInvite.updateMany({ where: { staffMemberId: command.staffId, acceptedAt: null, revokedAt: null }, data: { revokedAt: now } });
      const staff = await tx.staffMember.findUnique({
        where: { id: command.staffId },
        select: { membershipId: true },
      });
      if (staff?.membershipId) {
        await tx.restaurantMembership.update({
          where: { id: staff.membershipId },
          data: { active: false },
        });
      }
      break;
    }
    case "UPDATE_RESTAURANT": {
      requireManager(scope);
      const input = command.input;
      const settings = await tx.restaurant.findFirst({
        where: { id: scope.restaurantId, archivedAt: null },
        select: { operatingSettings: true, revision: true },
      });
      if (!settings || settings.revision !== command.expectedRevision) fail("CONFLICT", "Restaurant settings changed on another device.");
      const name = text(input.name, "Restaurant name", 80, true) as string;
      const location = text(input.location, "Location", 160, true) as string;
      const cleaningTargetMinutes = integer(input.cleaningTargetMinutes, "Cleaning target", 1, 120);
      const opensAtHour = integer(input.opensAtHour, "Opening hour", 0, 23);
      const closesAtHour = integer(input.closesAtHour, "Closing hour", 1, 24);
      const current = settings.operatingSettings && typeof settings.operatingSettings === "object" && !Array.isArray(settings.operatingSettings)
        ? settings.operatingSettings as Prisma.JsonObject
        : {};
      const changed = await tx.restaurant.updateMany({
        where: { id: scope.restaurantId, revision: command.expectedRevision, archivedAt: null },
        data: {
          name,
          location,
          walkInAvailability: input.isOpen ? "AVAILABLE" : "PAUSED",
          operatingSettings: { ...current, cleaningTargetMinutes, opensAtHour, closesAtHour },
          revision: { increment: 1 },
        },
      });
      if (changed.count !== 1) fail("CONFLICT", "Restaurant settings changed on another device.");
      break;
    }
  }

  const [entityType, entityId] = commandEntity(command);
  await tx.operationCommand.create({
    data: {
      id: command.commandId,
      restaurantId: scope.restaurantId,
      actorMembershipId: scope.membershipId,
      commandType: command.type,
      entityType,
      entityId,
      result: { ok: true, fingerprint: commandFingerprint(command) },
    },
  });
  await tx.restaurant.update({
    where: { id: scope.restaurantId },
    data: { lastOperationalUpdateAt: new Date() },
  });
}

export async function executeOperationsCommand(
  client: PrismaClient,
  scope: OperationsCommandScope,
  command: DatabaseOperationsCommand,
) {
  validateUuid(command.commandId, "Command ID");
  try {
    await client.$transaction(
      (tx) => executeInTransaction(tx, scope, command),
      { isolationLevel: "Serializable", maxWait: 5_000, timeout: 15_000 },
    );
  } catch (error) {
    if (error instanceof OperationsRepositoryError) throw error;
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      const replay = await client.operationCommand.findUnique({
        where: { id: command.commandId },
      });
      const result =
        replay?.result &&
        typeof replay.result === "object" &&
        !Array.isArray(replay.result)
          ? replay.result
          : null;
      if (
        replay?.restaurantId === scope.restaurantId &&
        replay.actorMembershipId === scope.membershipId &&
        replay.commandType === command.type &&
        result?.fingerprint === commandFingerprint(command)
      ) {
        return;
      }
    }
    if (typeof error === "object" && error && "code" in error && error.code === "P2034") {
      throw new OperationsRepositoryError(
        "CONFLICT",
        "This restaurant changed on another device. Halina refreshed the latest state.",
        { cause: error },
      );
    }
    throw new OperationsRepositoryError(
      "PERSISTENCE",
      "Halina could not save this change. Your database data was not replaced with demo data.",
      { cause: error },
    );
  }
}
