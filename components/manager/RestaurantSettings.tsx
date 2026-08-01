"use client";

import { Clock3, Save, Store } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useDemo } from "@/components/demo/DemoProvider";

function hourLabel(hour: number) {
  const normalized = hour % 24;
  const suffix = normalized >= 12 ? "PM" : "AM";
  const display = normalized % 12 || 12;
  return `${display}:00 ${suffix}`;
}

export function RestaurantSettings() {
  const { state, updateRestaurant } = useDemo();
  const [name, setName] = useState(state.restaurant.name);
  const [location, setLocation] = useState(state.restaurant.location);
  const [isOpen, setIsOpen] = useState(state.restaurant.isOpen);
  const [cleaningTargetMinutes, setCleaningTargetMinutes] = useState(
    state.restaurant.cleaningTargetMinutes,
  );
  const [opensAtHour, setOpensAtHour] = useState(state.restaurant.opensAtHour);
  const [closesAtHour, setClosesAtHour] = useState(
    state.restaurant.closesAtHour,
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setName(state.restaurant.name);
    setLocation(state.restaurant.location);
    setIsOpen(state.restaurant.isOpen);
    setCleaningTargetMinutes(state.restaurant.cleaningTargetMinutes);
    setOpensAtHour(state.restaurant.opensAtHour);
    setClosesAtHour(state.restaurant.closesAtHour);
  }, [state.restaurant]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = updateRestaurant({
      name,
      location,
      isOpen,
      cleaningTargetMinutes,
      opensAtHour,
      closesAtHour,
    });
    setMessage(result.ok ? "Restaurant settings saved." : result.error);
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

      <form onSubmit={submit} className="mt-7 space-y-5">
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
                Turn this off to show customers that walk-ins are paused.
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
                Analytics uses these hours when calculating occupancy.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-medium text-stone-700">
              Opens
              <select
                value={opensAtHour}
                onChange={(event) => setOpensAtHour(Number(event.target.value))}
                className="mt-2 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3"
              >
                {Array.from({ length: 24 }, (_, hour) => (
                  <option key={hour} value={hour}>
                    {hourLabel(hour)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-stone-700">
              Closes
              <select
                value={closesAtHour}
                onChange={(event) =>
                  setClosesAtHour(Number(event.target.value))
                }
                className="mt-2 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3"
              >
                {Array.from({ length: 24 }, (_, index) => index + 1).map(
                  (hour) => (
                    <option key={hour} value={hour}>
                      {hour === 24 ? "12:00 AM" : hourLabel(hour)}
                    </option>
                  ),
                )}
              </select>
            </label>
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
              role="status"
            >
              {message}
            </p>
          )}
          <button
            type="submit"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            <Save size={17} />
            Save settings
          </button>
        </div>
      </form>
    </div>
  );
}
