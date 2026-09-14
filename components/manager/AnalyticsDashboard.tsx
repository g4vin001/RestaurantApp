"use client";

import {
  BarChart3,
  Clock3,
  Sparkles,
  TrendingDown,
  Utensils,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useDemo } from "@/components/demo/DemoProvider";
import { StatusPill } from "@/components/manager/StatusPill";
import {
  deriveAnalytics,
  deriveInsights,
  getAnalyticsRange,
  type AnalyticsPreset,
  type AnalyticsRange,
} from "@/lib/domain/analytics";
import { formatMetricChange } from "@/lib/domain/analytics-presentation";
import { useLiveNow } from "@/lib/hooks/use-live-now";
import {
  restaurantDateKey,
  restaurantWallTimeToUtc,
} from "@/lib/time/restaurant-time";

type RangeChoice = AnalyticsPreset | "CUSTOM";

function inputDate(date: Date, timeZone: string) {
  return restaurantDateKey(date, timeZone);
}

function customRange(start: string, end: string, timeZone: string): AnalyticsRange {
  const startAt = restaurantWallTimeToUtc(`${start}T00:00`, timeZone);
  const endAt = restaurantWallTimeToUtc(`${end}T23:59`, timeZone);
  return {
    start: startAt ?? new Date(0),
    end: endAt ? new Date(endAt.getTime() + 59_999) : new Date(0),
    label: `${start} to ${end}`,
  };
}

function previousRange(range: AnalyticsRange): AnalyticsRange {
  const duration = range.end.getTime() - range.start.getTime();
  return {
    start: new Date(range.start.getTime() - duration - 1),
    end: new Date(range.start.getTime() - 1),
    label: "Previous period",
  };
}

function display(value: number | null, suffix = "") {
  return value === null ? "Not enough data" : `${value}${suffix}`;
}

function MetricCard({ label, value, detail, change, icon: Icon }: {
  label: string;
  value: string;
  detail: string;
  change: ReturnType<typeof formatMetricChange>;
  icon: typeof Utensils;
}) {
  return <section aria-label={label} className="min-w-0 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <h3 className="text-sm font-semibold text-stone-700">{label}</h3>
      <Icon size={18} aria-hidden="true" className="shrink-0 text-emerald-700" />
    </div>
    <p data-metric-value className={`mt-3 font-bold tracking-tight text-stone-950 ${value === "Not enough data" ? "text-lg" : "text-3xl tabular-nums"}`}>{value}</p>
    <p className="mt-2 text-xs leading-5 text-stone-600">{detail}</p>
    <p className={`mt-2 text-xs font-medium ${change?.tone === "positive" ? "text-emerald-700" : change?.tone === "negative" ? "text-rose-700" : "text-stone-600"}`}>
      {change?.text ?? "Comparison unavailable"}
    </p>
  </section>;
}

export function AnalyticsDashboard() {
  const { state } = useDemo();
  const now = useLiveNow(60_000, state.lastUpdatedAt);
  const todayRange = getAnalyticsRange(
    "LAST_7_DAYS",
    now,
    state.restaurant.timezone,
  );
  const [choice, setChoice] = useState<RangeChoice>("LAST_7_DAYS");
  const [customStart, setCustomStart] = useState(
    inputDate(todayRange.start, state.restaurant.timezone),
  );
  const [customEnd, setCustomEnd] = useState(
    inputDate(todayRange.end, state.restaurant.timezone),
  );
  const [zone, setZone] = useState("");
  const [tableId, setTableId] = useState("");
  const [selectedHour, setSelectedHour] = useState(12);

  const range = useMemo(
    () =>
      choice === "CUSTOM"
        ? customRange(customStart, customEnd, state.restaurant.timezone)
        : getAnalyticsRange(choice, now, state.restaurant.timezone),
    [choice, customEnd, customStart, now, state.restaurant.timezone],
  );
  const options = useMemo(
    () => ({ zone: zone || undefined, tableId: tableId || undefined }),
    [tableId, zone],
  );
  const analytics = useMemo(
    () => deriveAnalytics(state, range, options, now),
    [now, options, range, state],
  );
  const previous = useMemo(
    () => deriveAnalytics(state, previousRange(range), options, now),
    [now, options, range, state],
  );
  const restaurantAverage = useMemo(
    () => deriveAnalytics(state, range, {}, now),
    [now, range, state],
  );
  const insights = useMemo(
    () => deriveInsights(state, analytics),
    [analytics, state],
  );
  const zones = [
    ...new Set(
      state.tables.filter((table) => table.active).map((table) => table.zone),
    ),
  ];
  const filteredTables = state.tables.filter(
    (table) => table.active && (!zone || table.zone === zone),
  );
  const maxHourly = Math.max(
    1,
    ...analytics.hourlySeatings.map((item) => item.value),
  );

  const invalidRange = choice === "CUSTOM" && (!customStart || !customEnd || customStart > customEnd);
  const samples = analytics.sampleCounts;
  const metrics = [
    {
      label: "Table turns",
      value: String(analytics.turns),
      detail: "completed table seatings; a joined pair counts as two turns",
      change: formatMetricChange(analytics.turns, previous.turns, "turns"),
      icon: Sparkles,
    },
    {
      label: "Occupancy",
      value: display(analytics.occupancyRate, "%"),
      detail: `occupied service time across ${samples.tables} tables; includes active sessions`,
      change: formatMetricChange(analytics.occupancyRate, previous.occupancyRate, "pp"),
      icon: Utensils,
    },
    {
      label: "Seat utilization",
      value: display(analytics.seatUtilization, "%"),
      detail: `average capacity used across ${samples.dining} completed table seatings`,
      change: formatMetricChange(analytics.seatUtilization, previous.seatUtilization, "pp"),
      icon: BarChart3,
    },
    {
      label: "Average dining",
      value: display(analytics.averageDiningMinutes, " min"),
      detail: `seated to cleared · ${samples.dining} completed table seatings`,
      change: formatMetricChange(analytics.averageDiningMinutes, previous.averageDiningMinutes, "min"),
      icon: Clock3,
    },
    {
      label: "Median dining",
      value: display(analytics.medianDiningMinutes, " min"),
      detail: `middle duration · ${samples.dining} completed table seatings`,
      change: formatMetricChange(analytics.medianDiningMinutes, previous.medianDiningMinutes, "min"),
      icon: Clock3,
    },
    {
      label: "Average cleaning",
      value: display(analytics.averageCleaningMinutes, " min"),
      detail: `cleared to ready · ${samples.cleaning} recorded cleaning handoffs`,
      change: formatMetricChange(analytics.averageCleaningMinutes, previous.averageCleaningMinutes, "min", true),
      icon: Clock3,
    },
    {
      label: "Queue wait",
      value: display(analytics.averageQueueWaitMinutes, " min"),
      detail: `joined to seated · ${samples.seatedQueue} seated queue parties`,
      change: formatMetricChange(analytics.averageQueueWaitMinutes, previous.averageQueueWaitMinutes, "min", true),
      icon: Clock3,
    },
    {
      label: "Wait estimate error",
      value: display(analytics.promisedWaitMeanAbsoluteError, " min"),
      detail: `average distance from quoted wait · ${samples.seatedQueue} seated queue parties`,
      change: formatMetricChange(analytics.promisedWaitMeanAbsoluteError, previous.promisedWaitMeanAbsoluteError, "min", true),
      icon: BarChart3,
    },
    {
      label: "Abandonment",
      value: display(analytics.abandonmentRate, "%"),
      detail: `cancelled or no-show ÷ ${samples.resolvedQueue} resolved queue parties`,
      change: formatMetricChange(analytics.abandonmentRate, previous.abandonmentRate, "pp", true),
      icon: TrendingDown,
    },
    {
      label: "Busiest hour",
      value: analytics.busiestPeriod ?? "No data",
      detail: `most completed table seatings, grouped by seating time · ${state.restaurant.timezone}`,
      change: null,
      icon: BarChart3,
    },
  ];

  const primaryLabels = ["Table turns", "Occupancy", "Queue wait", "Average cleaning"];
  const primaryMetrics = primaryLabels.map((label) => metrics.find((metric) => metric.label === label)!);
  const secondaryMetrics = metrics.filter((metric) => !primaryLabels.includes(metric.label));

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div>
        <p className="text-sm font-semibold text-emerald-700">
          OPERATING INSIGHTS
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-950 sm:text-3xl">
          Analytics
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          Metrics are derived from table sessions, cleaning handoffs, and
          resolved queue records.
        </p>
      </div>

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Date range
            <select
              value={choice}
              onChange={(event) => setChoice(event.target.value as RangeChoice)}
              className="mt-2 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800"
            >
              <option value="TODAY">Today</option>
              <option value="LAST_7_DAYS">Last 7 days</option>
              <option value="LAST_30_DAYS">Last 30 days</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </label>
          {choice === "CUSTOM" && (
            <>
              <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Start
                <input
                  type="date"
                  value={customStart}
                  max={customEnd}
                  onChange={(event) => setCustomStart(event.target.value)}
                  className="mt-2 min-h-11 w-full rounded-xl border border-stone-300 px-3 text-sm"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                End
                <input
                  type="date"
                  value={customEnd}
                  min={customStart}
                  onChange={(event) => setCustomEnd(event.target.value)}
                  className="mt-2 min-h-11 w-full rounded-xl border border-stone-300 px-3 text-sm"
                />
              </label>
            </>
          )}
          <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Zone
            <select
              value={zone}
              onChange={(event) => {
                setZone(event.target.value);
                setTableId("");
              }}
              className="mt-2 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800"
            >
              <option value="">All zones</option>
              {zones.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Table
            <select
              value={tableId}
              onChange={(event) => setTableId(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800"
            >
              <option value="">All tables</option>
              {filteredTables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs text-stone-500">
          Showing {range.label}. Comparisons use the immediately preceding
          period of equal length. All times use {state.restaurant.timezone}. “pp” means percentage points.
        </p>
      </section>

      {invalidRange ? <p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Choose a start and end date, with the end on or after the start.</p> : <>
      <section aria-label="Service summary" className="mt-6">
        <h2 className="text-lg font-semibold text-stone-900">Service summary</h2>
        <p className="mt-1 text-sm leading-6 text-stone-600">Table filters apply to table metrics. Queue wait, estimate error and abandonment always cover the whole restaurant.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {primaryMetrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
        </div>
      </section>
      <details className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-stone-800">More service metrics</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {secondaryMetrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
        </div>
      </details>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-semibold text-stone-900">Completed seatings by hour</h2>
          <p className="mt-1 text-xs leading-5 text-stone-600">Table seatings, grouped by seating hour in {state.restaurant.timezone}. A joined pair contributes two table seatings.</p>
          <svg viewBox="0 0 640 220" role="img" aria-label="Completed table seatings by hour; exact values available below" className="mt-4 w-full">
            {[0, 0.5, 1].map((fraction) => <g key={fraction}>
              <line x1="40" x2="632" y1={180 - fraction * 150} y2={180 - fraction * 150} stroke="#e7e5e4" />
              <text x="32" y={184 - fraction * 150} textAnchor="end" fontSize="12" fill="#57534e">{Math.round(maxHourly * fraction * 10) / 10}</text>
            </g>)}
            {analytics.hourlySeatings.map(({ hour, value }) => <g key={hour}>
              <rect x={44 + hour * 24.4} y={180 - value / maxHourly * 150} width="18" height={value / maxHourly * 150} rx="2" fill="#059669" />
              {hour % 3 === 0 && <text x={53 + hour * 24.4} y="202" textAnchor="middle" fontSize="12" fill="#57534e">{String(hour).padStart(2, "0")}:00</text>}
            </g>)}
          </svg>
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-stone-50 p-3">
            <label className="text-sm font-medium text-stone-700">Inspect hour
              <select className="ml-2 min-h-11 rounded-lg border border-stone-300 bg-white px-3" value={selectedHour} onChange={(event) => setSelectedHour(Number(event.target.value))}>
                {analytics.hourlySeatings.map(({ hour }) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}
              </select>
            </label>
            <output aria-live="polite" className="text-sm font-semibold text-stone-900">{analytics.hourlySeatings[selectedHour].value} completed table seatings</output>
          </div>
          <details className="mt-3">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-emerald-800">View hourly counts</summary>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Exact completed table seatings by hour</caption>
              <thead><tr><th scope="col" className="py-2">Hour</th><th scope="col" className="py-2 text-right">Table seatings</th></tr></thead>
              <tbody>{analytics.hourlySeatings.map(({ hour, value }) => <tr key={hour} className="border-t border-stone-100"><th scope="row" className="py-2 font-normal">{String(hour).padStart(2, "0")}:00</th><td className="py-2 text-right tabular-nums">{value}</td></tr>)}</tbody>
            </table>
          </details>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-amber-600" />
            <h2 className="font-semibold text-stone-900">
              Operational insights
            </h2>
          </div>
          {insights.length ? (
            <div className="mt-4 space-y-3">
              {insights.map((insight) => (
                <article
                  key={insight.title}
                  className="rounded-xl border border-stone-200 p-4"
                >
                  <h3 className="text-sm font-semibold text-stone-900">
                    {insight.title}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-stone-600">
                    {insight.detail}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-emerald-700">
                    {insight.action}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-stone-50 p-4 text-sm leading-6 text-stone-500">
              {samples.dining === 0 ? "No completed table seatings in this range. Dining averages need completed sessions." : "No strong anomalies were detected for these filters. Small samples can hide patterns; try a wider date range."}
            </p>
          )}
        </section>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 px-5 py-4 sm:px-6">
          <h2 className="font-semibold text-stone-900">
            Per-table performance
          </h2>
          <p className="mt-1 text-xs text-stone-500">
            Only tables matching the active filters are included. Status is current; the other figures describe the selected period.
          </p>
        </div>
        {analytics.tableAnalytics.length === 0 && <p className="p-5 text-sm text-stone-600">No active tables match these filters.</p>}
        <div className="divide-y divide-stone-200 lg:hidden">
          {analytics.tableAnalytics.map((row) => {
            const table = state.tables.find((item) => item.id === row.tableId);
            if (!table) return null;
            return <article key={row.tableId} aria-label={`${table.label} performance`} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="font-semibold text-stone-900">{table.label}</h3><p className="mt-1 text-xs text-stone-600">{table.zone} · {table.capacity} seats</p></div>
                <StatusPill status={table.status} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                {[["Turns", String(row.turns)], ["Occupancy", display(row.occupancyRate, "%")], ["Average dining", display(row.averageDiningMinutes, " min")], ["Cleaning", display(row.averageCleaningMinutes, " min")]].map(([label, value]) => <div key={label}><dt className="text-xs text-stone-600">{label}</dt><dd className="mt-1 font-semibold tabular-nums text-stone-900">{value}</dd></div>)}
              </dl>
              <details className="mt-3">
                <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-emerald-800">More table metrics</summary>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  {[["Vs restaurant occupancy", formatMetricChange(row.occupancyRate, restaurantAverage.occupancyRate, "pp")?.text.replace("vs previous", "vs restaurant") ?? "Not enough data"], ["Seat use", display(row.seatUtilization, "%")], ["Median dining", display(row.medianDiningMinutes, " min")], ["Idle between sessions", display(row.averageIdleMinutes, " min")]].map(([label, value]) => <div key={label}><dt className="text-xs text-stone-600">{label}</dt><dd className="mt-1 font-medium text-stone-900">{value}</dd></div>)}
                </dl>
              </details>
            </article>;
          })}
        </div>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Table</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Turns</th>
                <th className="px-5 py-3 font-semibold">Occupancy</th>
                <th className="px-5 py-3 font-semibold">Vs restaurant</th>
                <th className="px-5 py-3 font-semibold">Seat use</th>
                <th className="px-5 py-3 font-semibold">Avg dining</th>
                <th className="px-5 py-3 font-semibold">Median</th>
                <th className="px-5 py-3 font-semibold">Cleaning</th>
                <th className="px-5 py-3 font-semibold">Idle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {analytics.tableAnalytics.map((row) => {
                const table = state.tables.find(
                  (item) => item.id === row.tableId,
                );
                if (!table) return null;
                return (
                  <tr key={row.tableId} className="hover:bg-stone-50/70">
                    <td className="px-5 py-4 font-semibold text-stone-900">
                      {table.label}
                      <span className="ml-2 text-xs font-normal text-stone-400">
                        {table.zone} · {table.capacity} seats
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill status={table.status} />
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {row.turns}
                    </td>
                    <td className="px-5 py-4 text-stone-600">
                      {display(row.occupancyRate, "%")}
                    </td>
                    <td className="px-5 py-4 text-stone-600">
                      {row.occupancyRate === null ||
                      restaurantAverage.occupancyRate === null
                        ? "Not enough data"
                        : `${row.occupancyRate - restaurantAverage.occupancyRate > 0 ? "+" : ""}${row.occupancyRate - restaurantAverage.occupancyRate} pp`}
                    </td>
                    <td className="px-5 py-4 text-stone-600">
                      {display(row.seatUtilization, "%")}
                    </td>
                    <td className="px-5 py-4 text-stone-600">
                      {display(row.averageDiningMinutes, " min")}
                    </td>
                    <td className="px-5 py-4 text-stone-600">
                      {display(row.medianDiningMinutes, " min")}
                    </td>
                    <td className="px-5 py-4 text-stone-600">
                      {display(row.averageCleaningMinutes, " min")}
                    </td>
                    <td className="px-5 py-4 text-stone-600">
                      {display(row.averageIdleMinutes, " min")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <p className="mt-4 text-xs leading-5 text-stone-600">Dining, turns and hourly counts use sessions seated in the selected range that have since been cleared. Cleaning uses recorded handoffs for sessions overlapping the range. Zero turns means no completed seatings; missing duration samples show “Not enough data”.</p>
      </>}
    </div>
  );
}
