import type { TableStatus } from "./types";

export const CORRECTION_WINDOW_MS = 15 * 60_000;

export type CorrectionEvent = {
  newStatus: TableStatus;
  occurredAt: string;
  note?: string | null;
};

/** Shared by both workspaces and the command boundary. Never trusts the UI clock. */
export function tableCorrectionEligibility(
  status: TableStatus,
  event: CorrectionEvent | null | undefined,
  now: number,
) {
  if (!event) return { eligible: false, reason: "There is no recent table action to correct." } as const;
  if (event.note?.startsWith("Correction:")) {
    return { eligible: false, reason: "This action is already a correction. Use a new status change." } as const;
  }
  if (event.note?.startsWith("Reservation moved")) {
    return { eligible: false, reason: "Move the reservation back to undo a table move." } as const;
  }
  if (status !== event.newStatus) {
    return { eligible: false, reason: "The table changed again. Refresh before correcting it." } as const;
  }
  const occurredAt = Date.parse(event.occurredAt);
  const expiresAt = occurredAt + CORRECTION_WINDOW_MS;
  if (!Number.isFinite(now) || !Number.isFinite(occurredAt) || now < occurredAt || now > expiresAt) {
    return { eligible: false, reason: "The 15-minute correction window has ended. Use a new status change." } as const;
  }
  return { eligible: true, expiresAt } as const;
}
