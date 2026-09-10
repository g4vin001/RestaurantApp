"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { TableStatus } from "@/lib/domain/types";
import { setFlash } from "@/lib/flash";
import { prisma } from "@/lib/prisma";
import type { DatabaseOperationsCommand } from "@/lib/repositories/commands";
import { executeOperationsCommand } from "@/lib/repositories/prisma/operations-commands";
import { OperationsRepositoryError } from "@/lib/repositories/operations";
import { broadcastRestaurantInvalidation } from "@/lib/realtime/invalidation";
import { reportDataError } from "@/lib/server/data-error";
import { getCurrentWorkContext, type WorkContext } from "@/lib/staff/access";
import { staffSeatingTableIds } from "@/lib/staff/seating";
import { restaurantWallTimeToUtc } from "@/lib/time/restaurant-time";

async function requireStaff() {
  const context = await getCurrentWorkContext();
  if (!context) throw new OperationsRepositoryError("UNAUTHORIZED", "Your work session has ended. Open Shift access to clock in again.");
  return context;
}

type StaffCommandBuilder = (
  context: WorkContext,
) => DatabaseOperationsCommand | Promise<DatabaseOperationsCommand>;

async function runStaffCommand(
  commandOrBuilder: DatabaseOperationsCommand | StaffCommandBuilder,
  success: string,
) {
  try {
    const context = await requireStaff();
    const command =
      typeof commandOrBuilder === "function"
        ? await commandOrBuilder(context)
        : commandOrBuilder;
    await executeOperationsCommand(prisma, {
      profileId: context.profileId,
      restaurantId: context.restaurantId,
      membershipId: context.membershipId,
      membershipRole: "STAFF",
      permissions: [...context.permissions],
    }, command);
    revalidatePath("/ops");
    revalidatePath(`/restaurants/${context.restaurantSlug}`);
    revalidatePath("/");
    await broadcastRestaurantInvalidation(prisma, {
      restaurantId: context.restaurantId,
      restaurantSlug: context.restaurantSlug,
      environment: context.restaurantEnvironment,
      entity: command.type.includes("QUEUE")
        ? "queue"
        : command.type.includes("RESERVATION")
          ? "reservation"
          : "table",
      revision: command.commandId,
    }).catch((error) => console.error("[halina:ops-broadcast]", error));
    await setFlash("message", success);
  } catch (error) {
    if (error instanceof OperationsRepositoryError) {
      await setFlash("error", error.message);
      return;
    }
    const reference = reportDataError("staff-operations-command", error);
    await setFlash(
      "error",
      `Halina could not save that operation. Support reference: ${reference}`,
    );
  }
}

export async function transitionStaffTable(formData: FormData) {
  const tableId = String(formData.get("tableId") ?? "");
  const status = String(formData.get("status") ?? "") as TableStatus;
  const partySize = Number(formData.get("partySize") ?? 0);
  const expectedRevision = Number(formData.get("expectedRevision") ?? -1);
  await runStaffCommand({
    type: "TRANSITION_TABLE",
    commandId: randomUUID(),
    tableId,
    status,
    expectedRevision,
    ...(status === "OCCUPIED" ? { partySize } : {}),
  }, "Table status saved.");
}

export async function correctStaffTable(formData: FormData) {
  await runStaffCommand(
    {
      type: "CORRECT_TABLE",
      commandId: randomUUID(),
      tableId: String(formData.get("tableId") ?? ""),
      expectedRevision: Number(formData.get("expectedRevision") ?? -1),
      reason: String(formData.get("reason") ?? ""),
    },
    "The latest linked table action was corrected.",
  );
}

export async function addStaffQueueEntry(formData: FormData) {
  await runStaffCommand(
    (context) => ({
      type: "ADD_QUEUE",
      commandId: randomUUID(),
      input: {
        partyName: String(formData.get("partyName") ?? ""),
        partySize: Number(formData.get("partySize") ?? 0),
        promisedWaitMinutes: Number(formData.get("promisedWaitMinutes") ?? 0),
        contact: context.permissions.includes("VIEW_CONTACT_DETAILS")
          ? String(formData.get("contact") ?? "") || undefined
          : undefined,
        notes: String(formData.get("notes") ?? "") || undefined,
        preferredZone: String(formData.get("preferredZone") ?? "") || undefined,
      },
    }),
    "Party added to the queue.",
  );
}

export async function editStaffQueueEntry(formData: FormData) {
  await runStaffCommand(
    async (context) => {
      const entryId = String(formData.get("queueId") ?? "");
      const existingContact = context.permissions.includes("VIEW_CONTACT_DETAILS")
        ? undefined
        : await prisma.queueEntry.findFirst({
            where: { id: entryId, restaurantId: context.restaurantId },
            select: { contact: true },
          });
      return {
        type: "UPDATE_QUEUE",
        commandId: randomUUID(),
        entryId,
        expectedRevision: Number(formData.get("expectedRevision") ?? -1),
        input: {
          partyName: String(formData.get("partyName") ?? ""),
          partySize: Number(formData.get("partySize") ?? 0),
          promisedWaitMinutes: Number(formData.get("promisedWaitMinutes") ?? 0),
          contact: context.permissions.includes("VIEW_CONTACT_DETAILS")
            ? String(formData.get("contact") ?? "") || undefined
            : existingContact?.contact ?? undefined,
          notes: String(formData.get("notes") ?? "") || undefined,
          preferredZone: String(formData.get("preferredZone") ?? "") || undefined,
        },
      };
    },
    "Queue entry updated.",
  );
}

export async function reorderStaffQueueEntry(formData: FormData) {
  await runStaffCommand(
    {
      type: "REORDER_QUEUE",
      commandId: randomUUID(),
      entryId: String(formData.get("queueId") ?? ""),
      expectedRevision: Number(formData.get("expectedRevision") ?? -1),
      direction: Number(formData.get("direction")) === -1 ? -1 : 1,
    },
    "Queue order updated.",
  );
}

export async function updateStaffQueueStatus(formData: FormData) {
  const entryId = String(formData.get("queueId") ?? "");
  const status = String(formData.get("status") ?? "") as "CALLED" | "CANCELLED" | "NO_SHOW";
  const expectedRevision = Number(formData.get("expectedRevision") ?? -1);
  await runStaffCommand({
    type: "SET_QUEUE_STATUS",
    commandId: randomUUID(),
    entryId,
    expectedRevision,
    status,
  }, status === "CALLED" ? "Party marked called. No message was sent." : `Party marked ${status.toLowerCase()}.`);
}

export async function seatStaffQueueEntry(formData: FormData) {
  const entryId = String(formData.get("queueId") ?? "");
  const expectedRevision = Number(formData.get("expectedRevision") ?? -1);
  await runStaffCommand({
    type: "SEAT_QUEUE",
    commandId: randomUUID(),
    entryId,
    expectedRevision,
    tableIds: staffSeatingTableIds(formData),
  }, "Party seated and all selected tables were updated.");
}

async function reservationInput(
  formData: FormData,
  context: WorkContext,
  reservationId?: string,
) {
  const scheduledAt = restaurantWallTimeToUtc(
    String(formData.get("scheduledAt") ?? ""),
    context.restaurantTimezone,
  );
  const existingContact =
    reservationId && !context.permissions.includes("VIEW_CONTACT_DETAILS")
      ? await prisma.reservation.findFirst({
          where: { id: reservationId, restaurantId: context.restaurantId },
          select: { contact: true },
        })
      : null;
  return {
    partyName: String(formData.get("partyName") ?? ""),
    partySize: Number(formData.get("partySize") ?? 0),
    scheduledAt: scheduledAt?.toISOString() ?? "",
    tableId: String(formData.get("tableId") ?? "") || undefined,
    contact: context.permissions.includes("VIEW_CONTACT_DETAILS")
      ? String(formData.get("contact") ?? "") || undefined
      : existingContact?.contact ?? undefined,
    notes: String(formData.get("notes") ?? "") || undefined,
  };
}

export async function addStaffReservation(formData: FormData) {
  await runStaffCommand(
    async (context) => ({
      type: "ADD_RESERVATION",
      commandId: randomUUID(),
      input: await reservationInput(formData, context),
    }),
    "Reservation created.",
  );
}

export async function editStaffReservation(formData: FormData) {
  await runStaffCommand(
    async (context) => {
      const reservationId = String(formData.get("reservationId") ?? "");
      return {
        type: "UPDATE_RESERVATION",
        commandId: randomUUID(),
        reservationId,
        expectedRevision: Number(formData.get("expectedRevision") ?? -1),
        input: await reservationInput(formData, context, reservationId),
      };
    },
    "Reservation updated.",
  );
}

export async function updateStaffReservationStatus(formData: FormData) {
  const status = String(formData.get("status") ?? "") as
    | "CONFIRMED"
    | "ARRIVED"
    | "CANCELLED"
    | "NO_SHOW"
    | "COMPLETED";
  await runStaffCommand(
    {
      type: "SET_RESERVATION_STATUS",
      commandId: randomUUID(),
      reservationId: String(formData.get("reservationId") ?? ""),
      expectedRevision: Number(formData.get("expectedRevision") ?? -1),
      status,
    },
    status === "ARRIVED"
      ? "Reservation marked arrived."
      : status === "CONFIRMED"
        ? "Reservation confirmed."
        : `Reservation marked ${status.toLowerCase().replace("_", "-")}.`,
  );
}

export async function seatStaffReservation(formData: FormData) {
  await runStaffCommand(
    {
      type: "SEAT_RESERVATION",
      commandId: randomUUID(),
      reservationId: String(formData.get("reservationId") ?? ""),
      expectedRevision: Number(formData.get("expectedRevision") ?? -1),
      tableIds: staffSeatingTableIds(formData),
    },
    "Reservation seated and all selected tables were updated.",
  );
}

export async function moveStaffReservationTable(formData: FormData) {
  await runStaffCommand(
    {
      type: "MOVE_RESERVATION_TABLE",
      commandId: randomUUID(),
      reservationId: String(formData.get("reservationId") ?? ""),
      expectedRevision: Number(formData.get("expectedRevision") ?? -1),
      tableIds: staffSeatingTableIds(formData),
    },
    "Reservation moved and all linked tables were updated.",
  );
}
