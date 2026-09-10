"use client";

import { Clock3, Save, Store } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useDemo } from "@/components/demo/DemoProvider";
import { OperatingScheduleEditor } from "@/components/manager/OperatingScheduleEditor";
import { readOperatingSchedule, validateOperatingSchedule } from "@/lib/domain/restaurant-schedule";

export function RestaurantSettings() {
  const { state, updateRestaurant } = useDemo();
  const [name, setName] = useState(state.restaurant.name);
  const [location, setLocation] = useState(state.restaurant.location);
  const [isOpen, setIsOpen] = useState(state.restaurant.isOpen);
  const [cleaningTargetMinutes, setCleaningTargetMinutes] = useState(
    state.restaurant.cleaningTargetMinutes,
  );
  const [schedule, setSchedule] = useState(() => readOperatingSchedule(state.restaurant));
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
    setSchedule(readOperatingSchedule(state.restaurant));
    setSourceRevision(state.restaurant.revision);
  }, [state.restaurant, dirty]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const validation = validateOperatingSchedule(schedule);
    if (!validation.ok) {
      setFailed(true);
      setMessage(validation.error);
      return;
    }
    submitting.current = true;
    setSaving(true);
    setMessage(null);
    try {
      const result = await updateRestaurant({
        name,
        location,
        isOpen,
        cleaningTargetMinutes,
        opensAtHour: state.restaurant.opensAtHour,
        closesAtHour: state.restaurant.closesAtHour,
        schedule: validation.schedule,
      }, sourceRevision);
      setFailed(!result.ok);
      if (result.ok) setDirty(false);
      setMessage(result.ok ? "Restaurant settings saved." : result.error);
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
                Customers see this name, location, and current walk-in status.
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
    </div>
  );
}
