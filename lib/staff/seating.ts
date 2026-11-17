import { recommendTables, type SeatingRecommendationState } from "@/lib/domain/operations";
import { reservationsHoldingTables } from "@/lib/domain/booking-conflicts";
import { DEFAULT_RESERVATION_MINUTES } from "@/lib/domain/restaurant-schedule";

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
  const reservedTableIds = reservationsHoldingTables(
    candidates.reservations, now, state.restaurant?.reservationDurationMinutes ?? DEFAULT_RESERVATION_MINUTES,
  );
  return recommendTables(candidates, { ...party, preferredZone: party.preferredZone ?? undefined }, now)
    // Managers retain deliberate booking-clash overrides in their workspace.
    .filter((option) => option.tableIds.every((id) => !reservedTableIds.has(id)))
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
