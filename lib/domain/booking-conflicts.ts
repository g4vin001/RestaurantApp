export const APPROVED_RESERVATION_STATUSES = ["CONFIRMED", "ARRIVED"] as const;
export const TABLE_HOLD_RESERVATION_STATUSES = ["PENDING_APPROVAL", ...APPROVED_RESERVATION_STATUSES] as const;

export function reservationHoldsTable(status: string) {
  return TABLE_HOLD_RESERVATION_STATUSES.some((candidate) => candidate === status);
}

export function overlappingReservationStarts(start: Date, durationMinutes: number) {
  const duration = durationMinutes * 60_000;
  return {
    gt: new Date(start.getTime() - duration),
    lt: new Date(start.getTime() + duration),
  };
}

export function isReservationInSeatingWindow(scheduledAt: Date | string, now: Date, durationMinutes: number) {
  const time = new Date(scheduledAt).getTime();
  return Math.abs(time - now.getTime()) < durationMinutes * 60_000;
}

export function reservationsHoldingTables(
  reservations: ReadonlyArray<{
    status: string;
    scheduledAt: Date | string;
    tableId?: string;
    tableIds?: string[];
  }>,
  now: Date,
  durationMinutes: number,
) {
  const result = new Set<string>();
  for (const booking of reservations) {
    if (reservationHoldsTable(booking.status) &&
        isReservationInSeatingWindow(booking.scheduledAt, now, durationMinutes)) {
      for (const tableId of booking.tableIds ?? (booking.tableId ? [booking.tableId] : [])) {
        result.add(tableId);
      }
    }
  }
  return result;
}
