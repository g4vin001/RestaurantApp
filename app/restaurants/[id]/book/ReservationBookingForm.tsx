"use client";

import { useActionState } from "react";
import { bookReservation, type ReservationBookingState } from "./actions";

const initialState: ReservationBookingState = {};

const inputClass =
  "mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const labelClass = "block text-sm font-medium text-stone-700";

export function ReservationBookingForm({
  restaurantId,
  defaultPartyName,
}: {
  restaurantId: string;
  defaultPartyName: string;
}) {
  const boundAction = bookReservation.bind(null, restaurantId);
  const [state, action, pending] = useActionState(boundAction, initialState);

  if (state.success) {
    return (
      <p role="status" className="text-sm font-medium text-emerald-700">
        Reservation confirmed — see you soon.
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
        Date and time
        <input name="scheduledAt" type="datetime-local" required className={inputClass} />
      </label>

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
        disabled={pending}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Booking…" : "Book table"}
      </button>
    </form>
  );
}
