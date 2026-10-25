"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { bookReservation, type ReservationBookingState } from "./actions";
import {
  fitsWithinServiceHours,
  formatDurationMinutes,
  isReservationDateBlocked,
  isWithinReservationWindows,
  isWithinServiceHours,
  periodsForDate,
  reservationWindowLabels,
  servicePeriodLabel,
  type OperatingSchedule,
  type ReservationWindows,
} from "@/lib/domain/restaurant-schedule";
import { restaurantWallTimeToUtc } from "@/lib/time/restaurant-time";

const initialState: ReservationBookingState = {};

const inputClass =
  "mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const labelClass = "block text-sm font-medium text-stone-700";

export function ReservationBookingForm({
  restaurantId,
  defaultPartyName,
  schedule,
  reservationDurationMinutes,
  blockedDates,
  reservationWindows,
  timeZone,
}: {
  restaurantId: string;
  defaultPartyName: string;
  schedule: OperatingSchedule;
  reservationDurationMinutes: number;
  blockedDates: string[];
  reservationWindows: ReservationWindows | null;
  timeZone: string;
}) {
  const boundAction = bookReservation.bind(null, restaurantId);
  const [state, action, pending] = useActionState(boundAction, initialState);
  const [scheduledAt, setScheduledAt] = useState("");
  const selectedTime = restaurantWallTimeToUtc(scheduledAt, timeZone);
  const length = formatDurationMinutes(reservationDurationMinutes);
  const closedAtTime = !!selectedTime && !isWithinServiceHours({ schedule, timezone: timeZone }, selectedTime);
  const dateBlocked = !!selectedTime && isReservationDateBlocked(blockedDates, selectedTime, timeZone);
  const outsideHours = !!selectedTime && !fitsWithinServiceHours({ schedule, timezone: timeZone }, selectedTime, reservationDurationMinutes);
  const selectedHours = selectedTime ? periodsForDate(schedule, scheduledAt.slice(0, 10)).map(servicePeriodLabel) : [];
  // Only reported when the restaurant is open, so "closed" stays the clearer message.
  const outsideWindow = !!selectedTime && !closedAtTime && !isWithinReservationWindows(reservationWindows, selectedTime, timeZone);
  const windowLabels = selectedTime && reservationWindows ? reservationWindowLabels(reservationWindows, scheduledAt.slice(0, 10)) : [];
  const problem = dateBlocked || outsideHours || outsideWindow;

  if (state.success) {
    return (
      <p role="status" className="text-sm font-medium text-emerald-700">
        Reservation request sent. It is pending the restaurant&apos;s approval. <Link href="/reservations" className="underline underline-offset-4">View your reservations</Link>
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <label className={labelClass}>
        Party name
        <input
          name="partyName"
          required
          maxLength={80}
          defaultValue={defaultPartyName}
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Party size
        <input
          name="partySize"
          type="number"
          required
          min={1}
          max={30}
          defaultValue={2}
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Date and time · {timeZone}
        <input name="scheduledAt" type="datetime-local" required value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} aria-describedby="booking-hours" className={inputClass} />
      </label>
      <p id="booking-hours" role={problem ? "alert" : "status"} className={`text-sm leading-6 ${problem ? "text-rose-700" : "text-stone-600"}`}>
        {dateBlocked ? "The restaurant isn't taking reservations on this date. Choose another day. " : ""}
        {!dateBlocked && outsideHours
          ? closedAtTime
            ? "The restaurant is closed at this time. Choose a time during service. "
            : `This reservation would run past closing. Choose a start at least ${length} before close. `
          : ""}
        {!dateBlocked && !outsideHours && outsideWindow
          ? windowLabels.length
            ? "Reservations can't start at this time. Choose a time in one of the reservation windows below. "
            : "The restaurant isn't taking reservations on this day. Choose another day. "
          : ""}
        {`Reservations last ${length}. `}
        {selectedTime ? `Service starting on this date: ${selectedHours.length ? selectedHours.join(" · ") : "none"}. Overnight service may continue from the previous day.` : "Choose a date to check its service hours."}
        {selectedTime && reservationWindows ? ` Reservations can start: ${windowLabels.length ? windowLabels.join(" · ") : "not on this day"}.` : ""}
      </p>

      <label className={labelClass}>
        Contact <span className="font-normal text-stone-400">(optional)</span>
        <input name="contact" maxLength={120} className={inputClass} />
      </label>

      <label className={labelClass}>
        Notes <span className="font-normal text-stone-400">(optional)</span>
        <textarea name="notes" maxLength={500} rows={3} className={inputClass} placeholder="Dietary restrictions, special occasions, etc."/>
      </label>

      {state.error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || outsideHours || outsideWindow}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Sending request…" : "Request reservation"}
      </button>
    </form>
  );
}
