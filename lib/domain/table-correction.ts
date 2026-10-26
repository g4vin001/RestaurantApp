import type { TableStatus } from "./types";

export const CORRECTION_WINDOW_MS = 15 * 60_000;
// Action times come from the server's clock, but the browser checks them with
// the device's. A phone or tablet running a little behind would otherwise see
// the action it just took as "in the future" and refuse to undo it.
export const CORRECTION_CLOCK_SKEW_MS = 2 * 60_000;

export type CorrectionEvent = {
  newStatus: TableStatus;
  occurredAt: string;
  note?: string | null;
};

const CORRECTION_PREFIX = "Correction:";

/** The most recent event by time, whatever order the list arrived in. */
export function latestTableEvent<T extends { occurredAt: string }>(events: T[]): T | undefined {
  let latest: T | undefined;
  for (const event of events) {
    if (!latest || Date.parse(event.occurredAt) > Date.parse(latest.occurredAt)) latest = event;
  }
  return latest;
}

/** The reason typed for a correction, or null when the event isn't one. */
export function correctionReasonFromNote(note: string | null | undefined) {
  if (!note?.startsWith(CORRECTION_PREFIX)) return null;
  return note.slice(CORRECTION_PREFIX.length).trim() || null;
}

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
  if (!Number.isFinite(now) || !Number.isFinite(occurredAt)) {
    return { eligible: false, reason: "There is no recent table action to correct." } as const;
  }
  if (now < occurredAt - CORRECTION_CLOCK_SKEW_MS) {
    return { eligible: false, reason: "This device's clock is behind the restaurant's. Check the device's date and time, then try again." } as const;
  }
  if (now > expiresAt) {
    return { eligible: false, reason: "The 15-minute correction window has ended. Use a new status change." } as const;
  }
  return { eligible: true, expiresAt } as const;
}
