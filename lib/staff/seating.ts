import { recommendTables, type SeatingRecommendationState } from "@/lib/domain/operations";

export type StaffSeatingOption = {
  tableIds: string[];
  label: string;
  capacity: number;
  zone: string;
  reason: string;
};

/** Use the manager's ranking with only the operational fields staff may read. */
export function staffSeatingOptions(
  state: SeatingRecommendationState,
  party: { partySize: number; preferredZone?: string | null },
  now: Date,
  excludeReservationId?: string,
): StaffSeatingOption[] {
  const candidates = {
    ...state,
    reservations: state.reservations.filter((reservation) => reservation.id !== excludeReservationId),
  };
  const tables = new Map(state.tables.map((table) => [table.id, table]));
  return recommendTables(candidates, { ...party, preferredZone: party.preferredZone ?? undefined }, now)
    // Managers retain deliberate booking-clash overrides in their workspace.
    .filter((option) => !candidates.reservations.some((reservation) =>
      ["PENDING_APPROVAL", "CONFIRMED", "ARRIVED"].includes(reservation.status) &&
      Date.parse(reservation.scheduledAt) >= now.getTime() &&
      Date.parse(reservation.scheduledAt) <= now.getTime() + 90 * 60_000 &&
      (reservation.tableIds ?? (reservation.tableId ? [reservation.tableId] : []))
        .some((id) => option.tableIds.includes(id)),
    ))
    .map((option) => ({
      tableIds: option.tableIds,
      label: option.tableIds.map((id) => tables.get(id)!.label).join(" + "),
      capacity: option.capacity,
      zone: tables.get(option.tableId)!.zone || "Main",
      reason: option.reason,
    }));
}

export function staffSeatingTableIds(formData: FormData): string[] {
  const values = formData.getAll("tableIds");
  // Retain compatibility with a page opened before this version was deployed.
  return (values.length ? values : formData.getAll("tableId"))
    .map((value) => typeof value === "string" ? value : "");
}
