"use client";

import { CalendarDays, Clock3, Plus, Trash2 } from "lucide-react";
import {
  WEEKDAYS,
  weekdayLabel,
  type OperatingSchedule,
  type ServicePeriod,
} from "@/lib/domain/restaurant-schedule";

const inputClass = "min-h-11 min-w-0 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-40";

function PeriodEditor({ label, periods, onChange }: {
  label: string;
  periods: ServicePeriod[];
  onChange: (periods: ServicePeriod[]) => void;
}) {
  return (
    <div className="min-w-0 space-y-2">
      {periods.map((period, index) => (
        <div key={index}>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
            <label className="min-w-0 text-sm text-stone-600">
              Opens
              <input type="time" required step={60} value={period.opensAt} aria-label={`${label}, period ${index + 1}, opens`} className={`${inputClass} mt-1`}
                onChange={(event) => onChange(periods.map((item, i) => i === index ? { ...item, opensAt: event.target.value } : item))} />
            </label>
            <label className="min-w-0 text-sm text-stone-600">
              Closes
              <input type="time" required step={60} value={period.closesAt} aria-label={`${label}, period ${index + 1}, closes`} className={`${inputClass} mt-1`}
                onChange={(event) => onChange(periods.map((item, i) => i === index ? { ...item, closesAt: event.target.value } : item))} />
            </label>
            <button type="button" className="grid min-h-11 min-w-11 place-items-center rounded-xl text-stone-500 hover:bg-rose-50 hover:text-rose-700" aria-label={`Remove ${label} period ${index + 1}`}
              onClick={() => onChange(periods.filter((_, i) => i !== index))}><Trash2 size={17} /></button>
          </div>
          {period.closesAt && period.opensAt && period.closesAt <= period.opensAt && (
            <p className="mt-1 text-sm text-amber-800">Closes the next day{period.closesAt === period.opensAt ? " · 24-hour service" : ""}.</p>
          )}
        </div>
      ))}
      <button type="button" className={buttonClass} disabled={periods.length >= 4}
        onClick={() => onChange([...periods, periods.length ? { opensAt: "17:00", closesAt: "22:00" } : { opensAt: "10:00", closesAt: "22:00" }])}>
        <Plus size={16} />{periods.length ? "Add split shift" : "Add opening hours"}
      </button>
    </div>
  );
}

export function OperatingScheduleEditor({ schedule, timeZone, onChange }: {
  schedule: OperatingSchedule;
  timeZone: string;
  onChange: (schedule: OperatingSchedule) => void;
}) {
  return (
    <>
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Clock3 size={19} /></span>
          <div>
            <h2 className="font-semibold text-stone-950">Weekly opening hours</h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">All times use {timeZone}. Add separate periods for lunch and dinner. A closing time at or before opening continues into the next day.</p>
          </div>
        </div>
        <div className="mt-5 divide-y divide-stone-200">
          {WEEKDAYS.map((day) => (
            <div key={day} className="grid gap-3 py-4 first:pt-0 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <div>
                <h3 className="font-semibold text-stone-900">{weekdayLabel(day)}</h3>
                <p className="mt-1 text-sm text-stone-500">{schedule.weekly[day].length ? "Open" : "No service starts"}</p>
                {schedule.weekly[day].length > 0 && (
                  <button type="button" className="mt-1 min-h-11 text-sm font-medium text-stone-600 underline underline-offset-4 hover:text-rose-700"
                    onClick={() => onChange({ ...schedule, weekly: { ...schedule.weekly, [day]: [] } })}>Set closed</button>
                )}
              </div>
              <PeriodEditor label={weekdayLabel(day)} periods={schedule.weekly[day]}
                onChange={(periods) => onChange({ ...schedule, weekly: { ...schedule.weekly, [day]: periods } })} />
            </div>
          ))}
        </div>
        <p className="mt-2 text-sm leading-6 text-stone-500">Overnight service belongs to the day it starts. Use a special-date closure below to close completely from midnight.</p>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700"><CalendarDays size={19} /></span>
          <div>
            <h2 className="font-semibold text-stone-950">Holidays and special dates</h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">These replace regular hours for that calendar date, including service carried over from the night before. Existing reservations stay in place; review affected bookings after changing hours.</p>
          </div>
        </div>
        {schedule.exceptions.length === 0 && <p className="mt-5 text-sm text-stone-500">No exceptions. The weekly schedule applies every day.</p>}
        <div className="mt-5 space-y-4">
          {schedule.exceptions.map((exception, index) => {
            const update = (patch: Partial<typeof exception>) => onChange({ ...schedule, exceptions: schedule.exceptions.map((item, i) => i === index ? { ...item, ...patch } : item) });
            return (
              <div key={index} className="rounded-xl border border-stone-200 bg-stone-50 p-3 sm:p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="min-w-0 text-sm font-medium text-stone-700">Date<input type="date" required value={exception.date} className={`${inputClass} mt-1`} onChange={(event) => update({ date: event.target.value })} /></label>
                  <label className="min-w-0 text-sm font-medium text-stone-700">Public label (optional)<input maxLength={80} value={exception.label} placeholder="e.g. Christmas Day" className={`${inputClass} mt-1`} onChange={(event) => update({ label: event.target.value })} /></label>
                </div>
                <div className="my-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-stone-700">{exception.periods.length ? "Special opening hours" : "Closed all day"}</span>
                  <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-rose-700 hover:bg-rose-50" onClick={() => onChange({ ...schedule, exceptions: schedule.exceptions.filter((_, i) => i !== index) })}><Trash2 size={16} />Remove date</button>
                </div>
                <PeriodEditor label={exception.date || `Special date ${index + 1}`} periods={exception.periods} onChange={(periods) => update({ periods })} />
              </div>
            );
          })}
        </div>
        <button type="button" className={`${buttonClass} mt-3`} disabled={schedule.exceptions.length >= 100}
          onClick={() => onChange({ ...schedule, exceptions: [...schedule.exceptions, { date: "", label: "", periods: [] }] })}><Plus size={16} />Add special date</button>
      </section>
    </>
  );
}
