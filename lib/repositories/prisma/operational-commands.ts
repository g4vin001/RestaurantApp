import "server-only";

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { canTransitionTable } from "@/lib/domain/transitions";
import type { QueueStatus, TableStatus } from "@/lib/domain/types";

export type OperationalActor = {
  restaurantId: string;
  profileId: string;
  staffMemberId?: string;
};

export class OperationalCommandError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "VALIDATION" | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "OperationalCommandError";
  }
}

function integerInRange(value: number, min: number, max: number) {
  return Number.isInteger(value) && value >= min && value <= max;
}

export async function transitionTableDatabase(
  client: PrismaClient,
  actor: OperationalActor,
  input: { tableId: string; toStatus: TableStatus; partySize?: number },
) {
  const occurredAt = new Date();
  return client.$transaction(
    async (tx) => {
      const table = await tx.diningTable.findFirst({
        where: {
          id: input.tableId,
          restaurantId: actor.restaurantId,
          active: true,
          archivedAt: null,
        },
        select: {
          id: true,
          label: true,
          capacity: true,
          currentStatus: true,
          statusRevision: true,
        },
      });
      if (!table) {
        throw new OperationalCommandError(
          "NOT_FOUND",
          "That table is no longer available on the active restaurant floor.",
        );
      }
      if (!canTransitionTable(table.currentStatus, input.toStatus)) {
        throw new OperationalCommandError(
          "VALIDATION",
          `${table.label} cannot move directly from ${table.currentStatus} to ${input.toStatus}.`,
        );
      }
      if (
        input.toStatus === "OCCUPIED" &&
        (!input.partySize || !integerInRange(input.partySize, 1, table.capacity))
      ) {
        throw new OperationalCommandError(
          "VALIDATION",
          `Enter a party size from 1 to ${table.capacity}.`,
        );
      }

      const changed = await tx.diningTable.updateMany({
        where: {
          id: table.id,
          restaurantId: actor.restaurantId,
          currentStatus: table.currentStatus,
          statusRevision: table.statusRevision,
        },
        data: {
          currentStatus: input.toStatus,
          statusRevision: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new OperationalCommandError(
          "CONFLICT",
          "This table was changed on another device. Refresh and try again.",
        );
      }

      if (input.toStatus === "OCCUPIED") {
        await tx.diningSession.create({
          data: {
            restaurantId: actor.restaurantId,
            diningTableId: table.id,
            partySize: input.partySize as number,
            status: "ACTIVE",
            seatedAt: occurredAt,
          },
        });
      } else if (
        table.currentStatus === "OCCUPIED" &&
        input.toStatus === "CLEANING"
      ) {
        const session = await tx.diningSession.findFirst({
          where: {
            restaurantId: actor.restaurantId,
            diningTableId: table.id,
            completedAt: null,
          },
          orderBy: { seatedAt: "desc" },
          select: { id: true },
        });
        if (session) {
          await tx.diningSession.update({
            where: { id: session.id },
            data: {
              status: "CLEANING",
              clearedAt: occurredAt,
              cleaningStartedAt: occurredAt,
            },
          });
        }
      } else if (
        table.currentStatus === "CLEANING" &&
        input.toStatus === "AVAILABLE"
      ) {
        const session = await tx.diningSession.findFirst({
          where: {
            restaurantId: actor.restaurantId,
            diningTableId: table.id,
            completedAt: null,
          },
          orderBy: { seatedAt: "desc" },
          select: { id: true },
        });
        if (session) {
          await tx.diningSession.update({
            where: { id: session.id },
            data: {
              status: "COMPLETED",
              availableAt: occurredAt,
              completedAt: occurredAt,
            },
          });
        }
      }

      await tx.tableStatusEvent.create({
        data: {
          restaurantId: actor.restaurantId,
          diningTableId: table.id,
          fromStatus: table.currentStatus,
          toStatus: input.toStatus,
          occurredAt,
          actorProfileId: actor.profileId,
          actorStaffMemberId: actor.staffMemberId,
          sourceCommandId: randomUUID(),
        },
      });
      await tx.restaurant.update({
        where: { id: actor.restaurantId },
        data: { lastOperationalUpdateAt: occurredAt },
      });

      return { tableId: table.id, status: input.toStatus, occurredAt };
    },
    { isolationLevel: "Serializable" },
  );
}

export async function createQueueEntryDatabase(
  client: PrismaClient,
  actor: OperationalActor,
  input: {
    partyName: string;
    partySize: number;
    promisedWaitMinutes: number;
    contact?: string;
    notes?: string;
    preferredZone?: string;
  },
) {
  const partyName = input.partyName.trim();
  if (!partyName) {
    throw new OperationalCommandError("VALIDATION", "Party name is required.");
  }
  if (!integerInRange(input.partySize, 1, 30)) {
    throw new OperationalCommandError(
      "VALIDATION",
      "Party size must be between 1 and 30.",
    );
  }
  if (!integerInRange(input.promisedWaitMinutes, 0, 240)) {
    throw new OperationalCommandError(
      "VALIDATION",
      "Promised wait must be between 0 and 240 minutes.",
    );
  }

  const now = new Date();
  return client.$transaction(async (tx) => {
    const entry = await tx.queueEntry.create({
      data: {
        restaurantId: actor.restaurantId,
        partyName,
        partySize: input.partySize,
        promisedWaitMinutes: input.promisedWaitMinutes,
        contact: input.contact?.trim() || null,
        notes: input.notes?.trim() || null,
        preferredZone: input.preferredZone?.trim() || null,
        status: "WAITING",
        joinedAt: now,
        createdById: actor.profileId,
        source: actor.staffMemberId ? "STAFF" : "MANAGER",
      },
    });
    await tx.restaurant.update({
      where: { id: actor.restaurantId },
      data: { lastOperationalUpdateAt: now },
    });
    return entry;
  });
}

export async function setQueueStatusDatabase(
  client: PrismaClient,
  actor: OperationalActor,
  input: {
    entryId: string;
    status: Extract<QueueStatus, "CALLED" | "CANCELLED" | "NO_SHOW">;
  },
) {
  const now = new Date();
  return client.$transaction(
    async (tx) => {
      const entry = await tx.queueEntry.findFirst({
        where: { id: input.entryId, restaurantId: actor.restaurantId },
        select: { id: true, status: true, revision: true },
      });
      if (!entry) {
        throw new OperationalCommandError("NOT_FOUND", "Queue entry was not found.");
      }
      if (input.status === "CALLED" && entry.status !== "WAITING") {
        throw new OperationalCommandError(
          "VALIDATION",
          "Only a waiting party can be marked called.",
        );
      }
      if (
        input.status !== "CALLED" &&
        !["WAITING", "CALLED"].includes(entry.status)
      ) {
        throw new OperationalCommandError(
          "VALIDATION",
          "This party has already been resolved.",
        );
      }

      const data =
        input.status === "CALLED"
          ? { status: "CALLED" as const, calledAt: now, revision: { increment: 1 } }
          : input.status === "CANCELLED"
            ? {
                status: "CANCELLED" as const,
                cancelledAt: now,
                revision: { increment: 1 },
              }
            : {
                status: "NO_SHOW" as const,
                noShowAt: now,
                revision: { increment: 1 },
              };

      const changed = await tx.queueEntry.updateMany({
        where: {
          id: entry.id,
          restaurantId: actor.restaurantId,
          revision: entry.revision,
          status: entry.status,
        },
        data,
      });
      if (changed.count !== 1) {
        throw new OperationalCommandError(
          "CONFLICT",
          "This queue entry changed on another device. Refresh and try again.",
        );
      }
      await tx.restaurant.update({
        where: { id: actor.restaurantId },
        data: { lastOperationalUpdateAt: now },
      });
      return { entryId: entry.id, status: input.status };
    },
    { isolationLevel: "Serializable" },
  );
}

export async function seatQueueEntryDatabase(
  client: PrismaClient,
  actor: OperationalActor,
  input: { entryId: string; tableId: string },
) {
  const now = new Date();
  return client.$transaction(
    async (tx) => {
      const [entry, table] = await Promise.all([
        tx.queueEntry.findFirst({
          where: { id: input.entryId, restaurantId: actor.restaurantId },
          select: {
            id: true,
            partySize: true,
            status: true,
            revision: true,
          },
        }),
        tx.diningTable.findFirst({
          where: {
            id: input.tableId,
            restaurantId: actor.restaurantId,
            active: true,
            archivedAt: null,
          },
          select: {
            id: true,
            label: true,
            capacity: true,
            minPartySize: true,
            maxPartySize: true,
            currentStatus: true,
            statusRevision: true,
          },
        }),
      ]);
      if (!entry) {
        throw new OperationalCommandError("NOT_FOUND", "Queue entry was not found.");
      }
      if (!table) {
        throw new OperationalCommandError("NOT_FOUND", "Dining table was not found.");
      }
      if (!["WAITING", "CALLED"].includes(entry.status)) {
        throw new OperationalCommandError(
          "VALIDATION",
          "Only a waiting or called party can be seated.",
        );
      }
      if (table.currentStatus !== "AVAILABLE") {
        throw new OperationalCommandError(
          "CONFLICT",
          `${table.label} is no longer available.`,
        );
      }
      if (
        entry.partySize < table.minPartySize ||
        entry.partySize > table.maxPartySize ||
        entry.partySize > table.capacity
      ) {
        throw new OperationalCommandError(
          "VALIDATION",
          `${table.label} cannot seat a party of ${entry.partySize}.`,
        );
      }

      const queueChanged = await tx.queueEntry.updateMany({
        where: {
          id: entry.id,
          restaurantId: actor.restaurantId,
          revision: entry.revision,
          status: entry.status,
        },
        data: {
          status: "SEATED",
          seatedAt: now,
          assignedTableId: table.id,
          revision: { increment: 1 },
        },
      });
      if (queueChanged.count !== 1) {
        throw new OperationalCommandError(
          "CONFLICT",
          "This party was changed on another device. Refresh and try again.",
        );
      }

      const tableChanged = await tx.diningTable.updateMany({
        where: {
          id: table.id,
          restaurantId: actor.restaurantId,
          currentStatus: "AVAILABLE",
          statusRevision: table.statusRevision,
        },
        data: {
          currentStatus: "OCCUPIED",
          statusRevision: { increment: 1 },
        },
      });
      if (tableChanged.count !== 1) {
        throw new OperationalCommandError(
          "CONFLICT",
          `${table.label} was taken on another device. Refresh and choose another table.`,
        );
      }

      await tx.diningSession.create({
        data: {
          restaurantId: actor.restaurantId,
          diningTableId: table.id,
          queueEntryId: entry.id,
          partySize: entry.partySize,
          status: "ACTIVE",
          seatedAt: now,
        },
      });
      await tx.tableStatusEvent.create({
        data: {
          restaurantId: actor.restaurantId,
          diningTableId: table.id,
          fromStatus: "AVAILABLE",
          toStatus: "OCCUPIED",
          occurredAt: now,
          actorProfileId: actor.profileId,
          actorStaffMemberId: actor.staffMemberId,
          sourceCommandId: randomUUID(),
          reason: `Seated queue party ${entry.id}`,
        },
      });
      await tx.restaurant.update({
        where: { id: actor.restaurantId },
        data: { lastOperationalUpdateAt: now },
      });

      return { entryId: entry.id, tableId: table.id, occurredAt: now };
    },
    { isolationLevel: "Serializable" },
  );
}
