"use client";

import { CalendarDays, Clock3, Plus, Save, Store, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useDemo } from "@/components/demo/DemoProvider";
import { OperatingScheduleEditor } from "@/components/manager/OperatingScheduleEditor";
import { RestaurantPhotoField } from "@/components/manager/RestaurantPhotoField";
import { Modal } from "@/components/ui/Modal";
import { reservationsCancelledByAvailabilityChange } from "@/lib/domain/operations";
import {
  formatDurationMinutes,
  MAX_RESERVATION_MINUTES,
  MAX_RESERVATION_NOTES_LENGTH,
  MIN_RESERVATION_MINUTES,
  readOperatingSchedule,
  RESERVATION_MINUTE_STEP,
  shortestServicePeriod,
  validateOperatingSchedule,
  validateReservationDuration,
} from "@/lib/domain/restaurant-schedule";
import { useLiveNow } from "@/lib/hooks/use-live-now";
import { restaurantDateKey } from "@/lib/time/restaurant-time";

function blockedDateLabel(date: string) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" })
    .format(new Date(`${date}T12:00:00Z`));
}

export function RestaurantSettings() {
  const { state, updateRestaurant, renderedAt } = useDemo();
  const [name, setName] = useState(state.restaurant.name);
  const [location, setLocation] = useState(state.restaurant.location);
  const [isOpen, setIsOpen] = useState(state.restaurant.isOpen);
  const [cleaningTargetMinutes, setCleaningTargetMinutes] = useState(
    state.restaurant.cleaningTargetMinutes,
  );
  const [reservationDurationMinutes, setReservationDurationMinutes] = useState(
    state.restaurant.reservationDurationMinutes,
  );
  const [acceptsReservations, setAcceptsReservations] = useState(state.restaurant.acceptsReservations);
  const [blockedDates, setBlockedDates] = useState(state.restaurant.reservationBlockedDates);
  const [reservationNotes, setReservationNotes] = useState(state.restaurant.reservationNotes);
  const [newBlockedDate, setNewBlockedDate] = useState("");
  const [schedule, setSchedule] = useState(() => readOperatingSchedule(state.restaurant));
  const [confirmCancelCount, setConfirmCancelCount] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [sourceRevision, setSourceRevision] = useState(state.restaurant.revision);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (dirty) return;
    setName(state.restaurant.name);
    setLocation(state.restaurant.location);
    setIsOpen(state.restaurant.isOpen);
    setCleaningTargetMinutes(state.restaurant.cleaningTargetMinutes);
    setReservationDurationMinutes(state.restaurant.reservationDurationMinutes);
    setAcceptsReservations(state.restaurant.acceptsReservations);
    setBlockedDates(state.restaurant.reservationBlockedDates);
    setReservationNotes(state.restaurant.reservationNotes);
    setSchedule(readOperatingSchedule(state.restaurant));
    setSourceRevision(state.restaurant.revision);
  }, [state.restaurant, dirty]);

  // The arrows stop at the longest step that fits the shortest weekly service
  // period of the schedule being edited. A typed or saved value above it shows
  // the validation error instead.
  const shortestPeriod = shortestServicePeriod(schedule);
  const durationCap = Math.min(shortestPeriod?.minutes ?? MAX_RESERVATION_MINUTES, MAX_RESERVATION_MINUTES);
  const durationMax = Math.max(
    MIN_RESERVATION_MINUTES,
    Math.floor(durationCap / RESERVATION_MINUTE_STEP) * RESERVATION_MINUTE_STEP,
  );
  const durationCheck = validateReservationDuration(reservationDurationMinutes, schedule);

  // Past blocked dates no longer matter; they are hidden and dropped on save.
  const now = useLiveNow(60_000, undefined, renderedAt);
  const today = restaurantDateKey(now, state.restaurant.timezone);
  const upcomingBlockedDates = blockedDates.filter((date) => date >= today);

  function addBlockedDate() {
    if (!newBlockedDate || newBlockedDate < today || blockedDates.includes(newBlockedDate)) return;
    setBlockedDates([...blockedDates, newBlockedDate].sort());
    setNewBlockedDate("");
    setDirty(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const validation = validateOperatingSchedule(schedule);
    if (!validation.ok) {
      setFailed(true);
      setMessage(validation.error);
      return;
    }
    const duration = validateReservationDuration(reservationDurationMinutes, validation.schedule);
    if (!duration.ok) {
      setFailed(true);
      setMessage(duration.error);
      return;
    }
    // Warn before a save that cancels bookings; the server applies the same rule.
    const cancelling = reservationsCancelledByAvailabilityChange(
      state.reservations,
      { acceptsReservations: state.restaurant.acceptsReservations, blockedDates: state.restaurant.reservationBlockedDates },
      { acceptsReservations, blockedDates: upcomingBlockedDates },
      new Date(),
      state.restaurant.timezone,
    ).length;
    if (cancelling > 0) {
      setConfirmCancelCount(cancelling);
      return;
    }
    void save(0);
  }

  async function save(cancelling: number) {
    setConfirmCancelCount(null);
    const validation = validateOperatingSchedule(schedule);
    if (!validation.ok || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setMessage(null);
    try {
      const result = await updateRestaurant({
        name,
        location,
        isOpen,
        cleaningTargetMinutes,
        reservationDurationMinutes,
        acceptsReservations,
        reservationBlockedDates: upcomingBlockedDates,
        reservationNotes,
        opensAtHour: state.restaurant.opensAtHour,
        closesAtHour: state.restaurant.closesAtHour,
        schedule: validation.schedule,
      }, sourceRevision);
      setFailed(!result.ok);
      if (result.ok) setDirty(false);
      setMessage(
        !result.ok
          ? result.error
          : cancelling > 0
            ? `Restaurant settings saved. ${cancelling} ${cancelling === 1 ? "reservation was" : "reservations were"} cancelled.`
            : "Restaurant settings saved.",
      );
    } catch {
      setFailed(true);
      setMessage("Settings could not be saved. Your edits are still here; please try again.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <p className="text-sm font-semibold text-emerald-700">
        RESTAURANT PROFILE
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-950 sm:text-3xl">
        Restaurant settings
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
        These details drive the manager dashboard, analytics operating window,
        and the public customer view.
      </p>

      <form onSubmit={submit} onChange={() => setDirty(true)} className="mt-7" aria-busy={saving}>
        <fieldset disabled={saving} className="min-w-0 space-y-5">
          {dirty && sourceRevision !== state.restaurant.revision && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Settings changed on another device. Your edits are still here. Load the latest settings before making further changes.
            <button type="button" onClick={() => { setDirty(false); setMessage(null); }} className="mt-2 block min-h-11 font-semibold underline underline-offset-4">Discard my edits and load latest</button>
          </div>}
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <Store size={19} />
            </span>
            <div>
              <h2 className="font-semibold text-stone-950">Public identity</h2>
              <p className="mt-1 text-sm text-stone-500">
                Customers see this photo, name, location, and current walk-in status.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-stone-700">
              Restaurant name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-xl border border-stone-300 px-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                required
              />
            </label>
            <label className="text-sm font-medium text-stone-700">
              Location
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-xl border border-stone-300 px-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                required
              />
            </label>
          </div>

          <RestaurantPhotoField />

          <label className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-stone-200 p-4">
            <span>
              <span className="block text-sm font-semibold text-stone-900">
                Accepting walk-ins
              </span>
              <span className="mt-1 block text-xs leading-5 text-stone-500">
                Allow walk-ins during opening hours. Turn this off to pause them while staying open for reservations.
              </span>
            </span>
            <input
              type="checkbox"
              checked={isOpen}
              onChange={(event) => setIsOpen(event.target.checked)}
              className="h-5 w-5 accent-emerald-700"
            />
          </label>
        </section>

        <OperatingScheduleEditor schedule={schedule} timeZone={state.restaurant.timezone} onChange={(value) => { setSchedule(value); setDirty(true); }} />

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700">
              <CalendarDays size={19} />
            </span>
            <div>
              <h2 className="font-semibold text-stone-950">Reservations</h2>
              <p className="mt-1 text-sm text-stone-500">
                Control online booking requests from customers. You can still add reservations yourself from the queue.
              </p>
            </div>
          </div>

          <label className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-stone-200 p-4">
            <span>
              <span className="block text-sm font-semibold text-stone-900">
                Accept online reservations
              </span>
              <span className="mt-1 block text-xs leading-5 text-stone-500">
                Turning this off hides the reservation button from customers and cancels requests still waiting for approval. Confirmed bookings stay.
              </span>
            </span>
            <input
              type="checkbox"
              checked={acceptsReservations}
              onChange={(event) => setAcceptsReservations(event.target.checked)}
              className="h-5 w-5 accent-emerald-700"
            />
          </label>

          <div className="mt-5 grid max-w-2xl gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-stone-700">
              Reservation length (minutes)
              <input
                type="number"
                min={MIN_RESERVATION_MINUTES}
                max={durationMax}
                step={RESERVATION_MINUTE_STEP}
                value={reservationDurationMinutes}
                onChange={(event) =>
                  setReservationDurationMinutes(Number(event.target.value))
                }
                aria-invalid={!durationCheck.ok}
                aria-describedby="reservation-length-help"
                className="mt-2 min-h-11 w-full rounded-xl border border-stone-300 px-3"
              />
              <span
                id="reservation-length-help"
                className={`mt-2 block text-xs leading-5 ${durationCheck.ok ? "font-normal text-stone-500" : "font-semibold text-rose-700"}`}
              >
                {durationCheck.ok
                  ? `${formatDurationMinutes(reservationDurationMinutes)}. Bookings must finish by closing time, so the last bookable slot is ${formatDurationMinutes(reservationDurationMinutes)} before close.${shortestPeriod ? ` Up to ${formatDurationMinutes(durationMax)}, set by your shortest service period.` : ""}`
                  : durationCheck.error}
              </span>
            </label>
          </div>

          <div className="mt-5">
            <p className="text-sm font-medium text-stone-700">Blocked dates</p>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              Customers can&apos;t request reservations on these dates. Adding a date cancels pending and confirmed bookings already on it.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-sm font-medium text-stone-700">
                <span className="sr-only">Date to block</span>
                <input
                  type="date"
                  min={today}
                  value={newBlockedDate}
                  onChange={(event) => setNewBlockedDate(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addBlockedDate();
                    }
                  }}
                  className="min-h-11 rounded-xl border border-stone-300 px-3"
                />
              </label>
              <button
                type="button"
                onClick={addBlockedDate}
                disabled={!newBlockedDate || newBlockedDate < today || blockedDates.includes(newBlockedDate)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 px-4 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                <Plus size={16} />
                Block date
              </button>
            </div>
            {upcomingBlockedDates.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Blocked reservation dates">
                {upcomingBlockedDates.map((date) => (
                  <li key={date} className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 py-1 pl-3 pr-1 text-sm font-medium text-rose-800">
                    {blockedDateLabel(date)}
                    <button
                      type="button"
                      onClick={() => {
                        setBlockedDates(blockedDates.filter((item) => item !== date));
                        setDirty(true);
                      }}
                      className="grid h-7 w-7 place-items-center rounded-full hover:bg-rose-100"
                      aria-label={`Unblock ${blockedDateLabel(date)}`}
                      title="Unblock date"
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-stone-500">No blocked dates.</p>
            )}
          </div>

          <label className="mt-5 block text-sm font-medium text-stone-700">
            Notes for customers
            <span className="mt-1 block text-xs font-normal leading-5 text-stone-500">
              Shown on the booking form and on customers&apos; upcoming reservations. Use it for policies like grace periods, deposits, or dress code.
            </span>
            <textarea
              value={reservationNotes}
              onChange={(event) => setReservationNotes(event.target.value)}
              maxLength={MAX_RESERVATION_NOTES_LENGTH}
              rows={3}
              placeholder="e.g. We hold reservations for 15 minutes past the booking time before marking them as a no-show."
              aria-describedby="reservation-notes-count"
              className="mt-2 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
            />
            <span id="reservation-notes-count" className="mt-1 block text-right text-xs font-normal text-stone-400">
              {reservationNotes.length}/{MAX_RESERVATION_NOTES_LENGTH}
            </span>
          </label>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700">
              <Clock3 size={19} />
            </span>
            <div>
              <h2 className="font-semibold text-stone-950">
                Operating targets
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                Target time to prepare a cleared table for the next party. Occupancy reports use your current saved opening hours and dated exceptions.
              </p>
            </div>
          </div>

          <div className="mt-5 max-w-sm">
            <label className="text-sm font-medium text-stone-700">
              Cleaning target (minutes)
              <input
                type="number"
                min={1}
                max={120}
                value={cleaningTargetMinutes}
                onChange={(event) =>
                  setCleaningTargetMinutes(Number(event.target.value))
                }
                className="mt-2 min-h-11 w-full rounded-xl border border-stone-300 px-3"
              />
            </label>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {message && (
            <p
              className="mr-auto text-sm font-medium text-stone-600"
              role={failed ? "alert" : "status"}
            >
              {message}
            </p>
          )}
          <button
            type="submit"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            <Save size={17} />
            {saving ? "Saving settings…" : "Save settings"}
          </button>
        </div>
        </fieldset>
      </form>

      <Modal
        open={confirmCancelCount !== null}
        title="Cancel affected reservations?"
        description={`Saving will cancel ${confirmCancelCount ?? 0} ${confirmCancelCount === 1 ? "reservation" : "reservations"}. Customers will see the reason on their reservations page.`}
        onClose={() => setConfirmCancelCount(null)}
        width="max-w-md"
      >
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setConfirmCancelCount(null)}
            className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-semibold text-stone-700"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={() => void save(confirmCancelCount ?? 0)}
            className="min-h-11 rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white"
          >
            Save and cancel reservations
          </button>
        </div>
      </Modal>
    </div>
  );
}
