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
import { createClient } from "@/lib/supabase/server";
import { getActiveStaffAccess } from "@/lib/staff/access";

async function requireStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("UNAUTHORIZED");
  const access = await getActiveStaffAccess(user.id);
  if (!access || !access.staffRecord?.staffRole || access.restaurant.archivedAt) {
    throw new Error("FORBIDDEN");
  }
  return {
    user,
    access: {
      ...access,
      staffRecord: { ...access.staffRecord, staffRole: access.staffRecord.staffRole },
    },
  };
}

async function runStaffCommand(command: DatabaseOperationsCommand, success: string) {
  try {
    const { user, access } = await requireStaff();
    await executeOperationsCommand(prisma, {
      profileId: user.id,
      restaurantId: access.restaurantId,
      membershipId: access.id,
      membershipRole: "STAFF",
      permissions: access.staffRecord.staffRole.permissions,
    }, command);
    revalidatePath("/ops");
    revalidatePath(`/restaurants/${access.restaurant.slug}`);
    revalidatePath("/");
    await broadcastRestaurantInvalidation(prisma, {
      restaurantId: access.restaurantId,
      restaurantSlug: access.restaurant.slug,
      environment: access.restaurant.environment,
      entity: command.type.includes("QUEUE") ? "queue" : "table",
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
    {
      type: "ADD_QUEUE",
      commandId: randomUUID(),
      input: {
        partyName: String(formData.get("partyName") ?? ""),
        partySize: Number(formData.get("partySize") ?? 0),
        promisedWaitMinutes: Number(formData.get("promisedWaitMinutes") ?? 0),
        contact: String(formData.get("contact") ?? "") || undefined,
        notes: String(formData.get("notes") ?? "") || undefined,
      },
    },
    "Party added to the queue.",
  );
}

export async function editStaffQueueEntry(formData: FormData) {
  await runStaffCommand(
    {
      type: "UPDATE_QUEUE",
      commandId: randomUUID(),
      entryId: String(formData.get("queueId") ?? ""),
      expectedRevision: Number(formData.get("expectedRevision") ?? -1),
      input: {
        partyName: String(formData.get("partyName") ?? ""),
        partySize: Number(formData.get("partySize") ?? 0),
        promisedWaitMinutes: Number(formData.get("promisedWaitMinutes") ?? 0),
        contact: String(formData.get("contact") ?? "") || undefined,
        notes: String(formData.get("notes") ?? "") || undefined,
      },
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
  const tableId = String(formData.get("tableId") ?? "");
  const expectedRevision = Number(formData.get("expectedRevision") ?? -1);
  await runStaffCommand({
    type: "SEAT_QUEUE",
    commandId: randomUUID(),
    entryId,
    expectedRevision,
    tableIds: [tableId],
  }, "Party seated and the table status was updated.");
}
