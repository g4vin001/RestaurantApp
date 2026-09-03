"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { QueueStatus, TableStatus } from "@/lib/domain/types";
import { setFlash } from "@/lib/flash";
import { prisma } from "@/lib/prisma";
import {
  createQueueEntryDatabase,
  OperationalCommandError,
  seatQueueEntryDatabase,
  setQueueStatusDatabase,
  transitionTableDatabase,
} from "@/lib/repositories/prisma/operational-commands";
import { getCurrentWorkContext } from "@/lib/staff/access";
import type { StaffPermission } from "@/lib/staff/policy";

const TABLE_STATUSES = new Set<TableStatus>([
  "AVAILABLE",
  "HELD",
  "RESERVED",
  "OCCUPIED",
  "CLEANING",
  "OUT_OF_SERVICE",
]);
const QUEUE_ACTION_STATUSES = new Set<QueueStatus>([
  "CALLED",
  "CANCELLED",
  "NO_SHOW",
]);

async function requirePermission(permission: StaffPermission) {
  const context = await getCurrentWorkContext();
  if (!context) redirect("/work");
  if (!context.permissions.includes(permission)) {
    await setFlash("error", "Your current staff role does not allow that action.");
    redirect("/ops");
  }
  return context;
}

function actor(context: Awaited<ReturnType<typeof requirePermission>>) {
  return {
    restaurantId: context.restaurantId,
    profileId: context.profileId,
    staffMemberId: context.staffMemberId,
  };
}

async function complete(message: string) {
  revalidatePath("/ops");
  revalidatePath("/manager");
  revalidatePath("/");
  await setFlash("message", message);
  redirect("/ops");
}

async function commandFailed(error: unknown) {
  console.error("[halina:staff-ops]", error);
  const message =
    error instanceof OperationalCommandError
      ? error.message
      : "Halina could not complete that operation. Refresh and try again.";
  await setFlash("error", message);
  redirect("/ops");
}

export async function transitionTableAction(formData: FormData) {
  const context = await requirePermission("CHANGE_TABLE_STATUS");
  const tableId = String(formData.get("tableId") ?? "");
  const toStatus = String(formData.get("toStatus") ?? "") as TableStatus;
  const partySizeValue = String(formData.get("partySize") ?? "").trim();
  const partySize = partySizeValue ? Number(partySizeValue) : undefined;
  if (!TABLE_STATUSES.has(toStatus)) {
    return commandFailed(
      new OperationalCommandError("VALIDATION", "Choose a valid table status."),
    );
  }

  try {
    await transitionTableDatabase(prisma, actor(context), {
      tableId,
      toStatus,
      partySize,
    });
  } catch (error) {
    return commandFailed(error);
  }
  return complete("Table status updated.");
}

export async function addQueueEntryAction(formData: FormData) {
  const context = await requirePermission("MANAGE_QUEUE");
  try {
    await createQueueEntryDatabase(prisma, actor(context), {
      partyName: String(formData.get("partyName") ?? ""),
      partySize: Number(formData.get("partySize") ?? 0),
      promisedWaitMinutes: Number(formData.get("promisedWaitMinutes") ?? 0),
      contact: String(formData.get("contact") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      preferredZone: String(formData.get("preferredZone") ?? ""),
    });
  } catch (error) {
    return commandFailed(error);
  }
  return complete("Party added to the queue.");
}

export async function setQueueStatusAction(formData: FormData) {
  const context = await requirePermission("MANAGE_QUEUE");
  const status = String(formData.get("status") ?? "") as QueueStatus;
  if (!QUEUE_ACTION_STATUSES.has(status)) {
    return commandFailed(
      new OperationalCommandError("VALIDATION", "Choose a valid queue action."),
    );
  }

  try {
    await setQueueStatusDatabase(prisma, actor(context), {
      entryId: String(formData.get("entryId") ?? ""),
      status: status as "CALLED" | "CANCELLED" | "NO_SHOW",
    });
  } catch (error) {
    return commandFailed(error);
  }
  return complete(
    status === "CALLED"
      ? "Party marked called. No SMS or message was sent."
      : status === "CANCELLED"
        ? "Queue entry cancelled."
        : "Queue entry marked no-show.",
  );
}

export async function seatQueueEntryAction(formData: FormData) {
  const context = await requirePermission("SEAT_PARTIES");
  try {
    await seatQueueEntryDatabase(prisma, actor(context), {
      entryId: String(formData.get("entryId") ?? ""),
      tableId: String(formData.get("tableId") ?? ""),
    });
  } catch (error) {
    return commandFailed(error);
  }
  return complete("Party seated and table marked occupied.");
}
