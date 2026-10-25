"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ServicePeriod } from "@/lib/domain/restaurant-schedule";

const periodInputClass = "min-h-11 min-w-0 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const periodButtonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-40";

// Shared by opening hours and reservation windows. The defaults are the
// opening-hours wording; reservation windows pass their own.
export function PeriodEditor({
  label,
  periods,
  onChange,
  startLabel = "Opens",
  endLabel = "Closes",
  addFirstLabel = "Add opening hours",
  addMoreLabel = "Add split shift",
  removeTitle = "Remove service period",
  firstPeriod = { opensAt: "10:00", closesAt: "22:00" },
  nextPeriod = { opensAt: "17:00", closesAt: "22:00" },
}: {
  label: string;
  periods: ServicePeriod[];
  onChange: (periods: ServicePeriod[]) => void;
  startLabel?: string;
  endLabel?: string;
  addFirstLabel?: string;
  addMoreLabel?: string;
  removeTitle?: string;
  firstPeriod?: ServicePeriod;
  nextPeriod?: ServicePeriod;
}) {
  return (
    <div className="min-w-0 space-y-2">
      {periods.map((period, index) => (
        <div key={index}>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
            <label className="min-w-0 text-sm text-stone-600">
              {startLabel}
              <input type="time" required step={60} value={period.opensAt} aria-label={`${label}, period ${index + 1}, ${startLabel.toLowerCase()}`} className={`${periodInputClass} mt-1`}
                onChange={(event) => onChange(periods.map((item, i) => i === index ? { ...item, opensAt: event.target.value } : item))} />
            </label>
            <label className="min-w-0 text-sm text-stone-600">
              {endLabel}
              <input type="time" required step={60} value={period.closesAt} aria-label={`${label}, period ${index + 1}, ${endLabel.toLowerCase()}`} className={`${periodInputClass} mt-1`}
                onChange={(event) => onChange(periods.map((item, i) => i === index ? { ...item, closesAt: event.target.value } : item))} />
            </label>
            <button type="button" className="grid min-h-11 min-w-11 place-items-center rounded-xl text-stone-500 hover:bg-rose-50 hover:text-rose-700" aria-label={`Remove ${label} period ${index + 1}`} title={removeTitle}
              onClick={() => onChange(periods.filter((_, i) => i !== index))}><Trash2 size={17} /></button>
          </div>
          {period.closesAt && period.opensAt && period.closesAt <= period.opensAt && (
            <p className="mt-1 text-sm text-amber-800">{endLabel} the next day{period.closesAt === period.opensAt ? " · 24-hour service" : ""}.</p>
          )}
        </div>
      ))}
      <button type="button" className={periodButtonClass} disabled={periods.length >= 4}
        onClick={() => onChange([...periods, periods.length ? nextPeriod : firstPeriod])}>
        <Plus size={16} />{periods.length ? addMoreLabel : addFirstLabel}
      </button>
    </div>
  );
}
