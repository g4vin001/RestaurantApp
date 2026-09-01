"use client";

import {
  BarChart3,
  Clock3,
  Sparkles,
  TrendingDown,
  TrendingUp,
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

function comparison(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null;
  return current - previous;
}

function MetricCard({
  label,
  value,
  detail,
  change,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  change: number | null;
  icon: typeof Utensils;
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-stone-500">{label}</p>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-stone-950">
        {value}
      </p>
      <div className="mt-2 flex min-h-5 flex-wrap items-center gap-2 text-xs">
        {change !== null && (
          <span
            className={`inline-flex items-center gap-1 font-semibold ${change > 0 ? "text-emerald-700" : change < 0 ? "text-rose-700" : "text-stone-500"}`}
          >
            {change > 0 ? (
              <TrendingUp size={13} />
            ) : change < 0 ? (
              <TrendingDown size={13} />
            ) : null}
            {change > 0 ? "+" : ""}
            {change} vs previous
          </span>
        )}
        <span className="text-stone-500">{detail}</span>
      </div>
    </section>
  );
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

  const metrics = [
    {
      label: "Table turns",
      value: analytics.turns ? String(analytics.turns) : "Not enough data",
      detail: "completed seatings",
      change: comparison(analytics.turns, previous.turns),
      icon: Sparkles,
    },
    {
      label: "Occupancy",
      value: display(analytics.occupancyRate, "%"),
      detail: "occupied time ÷ operating time",
      change: comparison(analytics.occupancyRate, previous.occupancyRate),
      icon: Utensils,
    },
    {
      label: "Seat utilization",
      value: display(analytics.seatUtilization, "%"),
      detail: "party size ÷ table capacity",
      change: comparison(analytics.seatUtilization, previous.seatUtilization),
      icon: BarChart3,
    },
    {
      label: "Average dining",
      value: display(analytics.averageDiningMinutes, " min"),
      detail: "seated to cleared",
      change: comparison(
        analytics.averageDiningMinutes,
        previous.averageDiningMinutes,
      ),
      icon: Clock3,
    },
    {
      label: "Median dining",
      value: display(analytics.medianDiningMinutes, " min"),
      detail: "middle completed duration",
      change: comparison(
        analytics.medianDiningMinutes,
        previous.medianDiningMinutes,
      ),
      icon: Clock3,
    },
    {
      label: "Average cleaning",
      value: display(analytics.averageCleaningMinutes, " min"),
      detail: "cleared to available",
      change: comparison(
        analytics.averageCleaningMinutes,
        previous.averageCleaningMinutes,
      ),
      icon: Clock3,
    },
    {
      label: "Queue wait",
      value: display(analytics.averageQueueWaitMinutes, " min"),
      detail: "joined to seated",
      change: comparison(
        analytics.averageQueueWaitMinutes,
        previous.averageQueueWaitMinutes,
      ),
      icon: Clock3,
    },
    {
      label: "Wait estimate error",
      value: display(analytics.promisedWaitMeanAbsoluteError, " min"),
      detail: "mean absolute error",
      change: comparison(
        analytics.promisedWaitMeanAbsoluteError,
        previous.promisedWaitMeanAbsoluteError,
      ),
      icon: BarChart3,
    },
    {
      label: "Abandonment",
      value: display(analytics.abandonmentRate, "%"),
      detail: "cancelled or no-show",
      change: comparison(analytics.abandonmentRate, previous.abandonmentRate),
      icon: TrendingDown,
    },
    {
      label: "Busiest hour",
      value: analytics.busiestPeriod ?? "No data",
      detail: "most completed seatings",
      change: null,
      icon: BarChart3,
    },
  ];

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
          period of equal length.
        </p>
      </section>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-semibold text-stone-900">
            Completed seatings by hour
          </h2>
          <p className="mt-1 text-xs text-stone-500">
            Times are shown in Asia/Manila.
          </p>
          <div
            className="mt-6 flex h-56 items-end gap-1"
            role="img"
            aria-label="Bar chart of completed seatings by hour"
          >
            {analytics.hourlySeatings.map(({ hour, value }) => (
              <div
                key={hour}
                className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"
              >
                <div
                  className="w-full rounded-t bg-emerald-600 transition-all"
                  style={{
                    height: `${Math.max(value ? 8 : 2, (value / maxHourly) * 170)}px`,
                  }}
                  title={`${String(hour).padStart(2, "0")}:00: ${value} seatings`}
                  aria-label={`${String(hour).padStart(2, "0")}:00, ${value} seatings`}
                />
                {hour % 3 === 0 && (
                  <span className="text-[10px] text-stone-400">
                    {String(hour).padStart(2, "0")}
                  </span>
                )}
              </div>
            ))}
          </div>
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
              No strong anomalies were detected for these filters. Try a wider
              date range or all tables.
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
            Only tables matching the active filters are included.
          </p>
        </div>
        <div className="overflow-x-auto">
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
                      {row.turns || "No data"}
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
    </div>
  );
}
