"use client";

import { PeriodEditor } from "@/components/manager/PeriodEditor";
import {
  WEEKDAYS,
  weekdayLabel,
  type OperatingSchedule,
  type ReservationWindows,
} from "@/lib/domain/restaurant-schedule";

// When customer reservations may start, separate from opening hours. Off (null)
// means bookable whenever the restaurant is open.
export function ReservationWindowsEditor({ windows, openingHours, onChange }: {
  windows: ReservationWindows | null;
  openingHours: OperatingSchedule["weekly"];
  onChange: (windows: ReservationWindows | null) => void;
}) {
  return (
    <div className="mt-5">
      <label className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 p-4">
        <span>
          <span className="block text-sm font-semibold text-stone-900">
            Limit reservation times
          </span>
          <span className="mt-1 block text-xs leading-5 text-stone-500">
            Choose when customer reservations can start, separate from your opening hours. Reservations still have to finish by closing time. Off means customers can book any time you&apos;re open.
          </span>
        </span>
        <input
          type="checkbox"
          checked={windows !== null}
          // Start from the opening hours so managers only need to narrow them.
          onChange={(event) => onChange(event.target.checked ? structuredClone(openingHours) : null)}
          className="h-5 w-5 accent-emerald-700"
        />
      </label>

      {windows && (
        <div className="mt-3 divide-y divide-stone-200 rounded-xl border border-stone-200 px-4">
          {WEEKDAYS.map((day) => (
            <div key={day} className="grid gap-3 py-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <div>
                <h3 className="text-sm font-semibold text-stone-900">{weekdayLabel(day)}</h3>
                <p className="mt-1 text-xs text-stone-500">
                  {windows[day].length ? "Reservations can start" : "No reservations this day"}
                </p>
              </div>
              <PeriodEditor
                label={`Reservations ${weekdayLabel(day)}`}
                periods={windows[day]}
                onChange={(periods) => onChange({ ...windows, [day]: periods })}
                startLabel="From"
                endLabel="Until"
                addFirstLabel="Add reservation window"
                addMoreLabel="Add another window"
                removeTitle="Remove reservation window"
                firstPeriod={{ opensAt: "17:00", closesAt: "20:00" }}
                nextPeriod={{ opensAt: "11:30", closesAt: "13:30" }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
