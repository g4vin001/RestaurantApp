"use client";

import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Clock3,
  Sparkles,
  UsersRound,
  Utensils,
} from "lucide-react";
import { useDemo } from "@/components/demo/DemoProvider";
import { StatusPill } from "@/components/manager/StatusPill";
import { deriveOverview, minutesBetween } from "@/lib/domain/analytics";
import { tableStatusLabel } from "@/lib/domain/transitions";
import { useLiveNow } from "@/lib/hooks/use-live-now";
import {
  formatRestaurantTime,
  restaurantTimeZone,
} from "@/lib/time/restaurant-time";


function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "emerald",
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Utensils;
  tone?: "emerald" | "amber" | "blue" | "violet";
}) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-sky-50 text-sky-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-stone-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-stone-900">
            {value}
          </p>
        </div>
        <span
          className={`grid h-10 w-10 place-items-center rounded-xl ${tones[tone]}`}
        >
          <Icon size={20} />
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-stone-500">{detail}</p>
    </section>
  );
}

export function OverviewDashboard() {
  const { state } = useDemo();
  const now = useLiveNow(30_000, state.lastUpdatedAt);
  const timeZone = restaurantTimeZone(state.restaurant.timezone);
  const manilaHour = Number(
    new Intl.DateTimeFormat("en-PH", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  const dayLabel = new Intl.DateTimeFormat("en-PH", {
    timeZone,
    weekday: "long",
  })
    .format(now)
    .toUpperCase();
  const greeting =
    manilaHour < 12 ? "morning" : manilaHour < 18 ? "afternoon" : "evening";
  const overview = deriveOverview(state, now);
  const upcoming = [...state.reservations]
    .filter((reservation) => reservation.status === "CONFIRMED")
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-emerald-700">
            {dayLabel} OPERATIONS
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-950 sm:text-3xl">
            Good {greeting}, manager
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            Here is what needs attention at {state.restaurant.name}.
          </p>
        </div>
        <Link
          href="/manager/floor"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
        >
          Open live floor <ArrowRight size={17} />
        </Link>
      </div>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Current occupancy"
          value={
            overview.occupancyRate === null
              ? "No data"
              : `${overview.occupancyRate}%`
          }
          detail={`${overview.occupied} of ${overview.totalTables} active tables occupied`}
          icon={Utensils}
        />
        <MetricCard
          label="Active queue"
          value={`${overview.queueCount} ${overview.queueCount === 1 ? "party" : "parties"}`}
          detail={
            overview.longestWaitMinutes === null
              ? "No one is waiting"
              : `Longest wait is ${overview.longestWaitMinutes} minutes`
          }
          icon={UsersRound}
          tone="amber"
        />
        <MetricCard
          label="Estimated wait"
          value={
            overview.estimatedWaitMinutes
              ? `${overview.estimatedWaitMinutes} min`
              : "No wait"
          }
          detail="Based on the live queue and available capacity"
          icon={Clock3}
          tone="blue"
        />
        <MetricCard
          label="Completed seatings"
          value={String(overview.completedSeatings)}
          detail={
            overview.averageDiningMinutes === null
              ? "Not enough duration data"
              : `${overview.averageDiningMinutes} min average dining duration`
          }
          icon={Sparkles}
          tone="violet"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(310px,0.7fr)]">
        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
          <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4 sm:px-6">
            <div>
              <h2 className="font-semibold text-stone-900">
                Live floor snapshot
              </h2>
              <p className="mt-1 text-xs text-stone-500">
                All active tables, grouped by current state
              </p>
            </div>
            <Link
              href="/manager/floor"
              className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
            >
              View floor
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5 sm:p-6">
            {state.tables
              .filter((table) => table.active)
              .map((table) => (
                <Link
                  key={table.id}
                  href={`/manager/floor?table=${table.id}`}
                  className="group rounded-xl border border-stone-200 p-3 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-base font-bold text-stone-900">
                      {table.label}
                    </span>
                    <span className="text-xs text-stone-400">
                      {table.capacity} seats
                    </span>
                  </div>
                  <div className="mt-4">
                    <StatusPill status={table.status} />
                  </div>
                  <p className="mt-3 text-xs text-stone-500">
                    {minutesBetween(table.statusChangedAt, now.toISOString())}{" "}
                    min · {table.zone}
                  </p>
                </Link>
              ))}
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-[0_1px_2px_rgba(28,25,23,0.04)] sm:p-6">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-700">
              <BellRing size={18} />
            </span>
            <div>
              <h2 className="font-semibold text-stone-900">Needs attention</h2>
              <p className="text-xs text-stone-500">
                Operational alerts right now
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {overview.overdueCleaning.map((table) => (
              <Link
                key={table.id}
                href={`/manager/floor?table=${table.id}`}
                className="block rounded-xl border border-amber-200 bg-amber-50 p-3.5 hover:border-amber-300"
              >
                <p className="text-sm font-semibold text-amber-950">
                  {table.label} is overdue for cleaning
                </p>
                <p className="mt-1 text-xs leading-5 text-amber-800">
                  Cleaning for{" "}
                  {minutesBetween(table.statusChangedAt, now.toISOString())}{" "}
                  min; target is {state.restaurant.cleaningTargetMinutes} min.
                </p>
              </Link>
            ))}
            {overview.longestWaiting &&
              overview.longestWaitMinutes !== null &&
              overview.longestWaitMinutes >
                overview.longestWaiting.promisedWaitMinutes && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5">
                  <p className="text-sm font-semibold text-rose-950">
                    {overview.longestWaiting.partyName} passed the promised wait
                  </p>
                  <p className="mt-1 text-xs leading-5 text-rose-800">
                    Waiting {overview.longestWaitMinutes} min against a{" "}
                    {overview.longestWaiting.promisedWaitMinutes}-min promise.
                  </p>
                </div>
              )}
            {!overview.overdueCleaning.length &&
              (!overview.longestWaiting ||
                (overview.longestWaitMinutes ?? 0) <=
                  overview.longestWaiting.promisedWaitMinutes) && (
                <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
                  No urgent operational alerts.
                </p>
              )}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
          <h2 className="font-semibold text-stone-900">
            Near-term reservations
          </h2>
          <div className="mt-4 divide-y divide-stone-100">
            {upcoming.map((reservation) => {
              const table = state.tables.find(
                (item) => item.id === reservation.tableId,
              );
              return (
                <div
                  key={reservation.id}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-semibold text-stone-900">
                      {reservation.partyName}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {reservation.partySize} guests ·{" "}
                      {table?.label ?? "Unassigned"}
                    </p>
                  </div>
                  <time className="text-sm font-semibold text-stone-700">
                    {formatRestaurantTime(reservation.scheduledAt, timeZone)}
                  </time>
                </div>
              );
            })}
            {!upcoming.length && (
              <p className="rounded-xl bg-stone-50 p-4 text-sm text-stone-500">
                No upcoming confirmed reservations.
              </p>
            )}
          </div>
        </section>
        <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
          <h2 className="font-semibold text-stone-900">Recent activity</h2>
          <div className="mt-4 space-y-3">
            {state.events.length ? (
              state.events.slice(0, 4).map((event) => {
                const table = state.tables.find(
                  (item) => item.id === event.tableId,
                );
                return (
                  <div key={event.id} className="flex gap-3">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                    <div>
                      <p className="text-sm text-stone-700">
                        <strong>{table?.label}</strong> changed from{" "}
                        {tableStatusLabel(event.previousStatus)} to{" "}
                        {tableStatusLabel(event.newStatus)}
                      </p>
                      <p className="mt-1 text-xs text-stone-400">
                        {formatRestaurantTime(event.occurredAt, timeZone)} ·{" "}
                        {event.actor}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="rounded-xl bg-stone-50 p-4 text-sm text-stone-500">
                Live changes will appear here. Try updating a table on the Live
                floor.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
