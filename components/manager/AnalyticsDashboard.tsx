"use client";

import { BarChart3, Clock3, Sparkles, Utensils } from "lucide-react";
import { useMemo } from "react";
import { useDemo } from "@/components/demo/DemoProvider";
import { StatusPill } from "@/components/manager/StatusPill";
import { deriveOverview, minutesBetween } from "@/lib/domain/analytics";

export function AnalyticsDashboard() {
  const { state } = useDemo();
  const overview = useMemo(() => deriveOverview(state), [state]);
  const tableRows = state.tables.map((table) => {
    const sessions = state.sessions.filter((session) => session.tableId === table.id);
    const completed = sessions.filter((session) => session.clearedAt);
    const durations = completed.map((session) => minutesBetween(session.seatedAt, session.clearedAt as string));
    return {
      table,
      turns: sessions.length,
      averageDuration: durations.length
        ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
        : null,
      seatUtilization: sessions.length
        ? Math.round(
            (sessions.reduce((sum, session) => sum + session.partySize / table.capacity, 0) /
              sessions.length) *
              100,
          )
        : null,
    };
  });

  const metrics = [
    { label: "Current occupancy", value: overview.occupancyRate === null ? "No data" : `${overview.occupancyRate}%`, detail: "Occupied tables ÷ active tables", icon: Utensils },
    { label: "Completed seatings", value: String(overview.completedSeatings), detail: "Sessions with a recorded clear time", icon: Sparkles },
    { label: "Average dining", value: overview.averageDiningMinutes === null ? "No data" : `${overview.averageDiningMinutes} min`, detail: "Mean seated-to-cleared duration", icon: Clock3 },
    { label: "Active queue", value: String(overview.queueCount), detail: "Waiting and called parties", icon: BarChart3 },
  ];

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div>
        <p className="text-sm font-semibold text-emerald-700">OPERATING INSIGHTS</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-950 sm:text-3xl">Analytics</h1>
        <p className="mt-2 text-sm text-stone-500">Every value below is calculated from the shared table sessions and live queue.</p>
      </div>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, detail, icon: Icon }) => (
          <section key={label} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between"><p className="text-sm font-medium text-stone-500">{label}</p><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Icon size={18} /></span></div>
            <p className="mt-3 text-3xl font-bold tracking-tight text-stone-950">{value}</p>
            <p className="mt-2 text-xs leading-5 text-stone-500">{detail}</p>
          </section>
        ))}
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 px-5 py-4 sm:px-6"><h2 className="font-semibold text-stone-900">Per-table performance</h2><p className="mt-1 text-xs text-stone-500">Calculated directly from table sessions in this demo dataset</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500"><tr><th className="px-6 py-3 font-semibold">Table</th><th className="px-6 py-3 font-semibold">Zone</th><th className="px-6 py-3 font-semibold">Status</th><th className="px-6 py-3 font-semibold">Sessions</th><th className="px-6 py-3 font-semibold">Avg. dining</th><th className="px-6 py-3 font-semibold">Seat utilization</th></tr></thead>
            <tbody className="divide-y divide-stone-100">{tableRows.map(({ table, turns, averageDuration, seatUtilization }) => <tr key={table.id} className="hover:bg-stone-50/70"><td className="px-6 py-4 font-semibold text-stone-900">{table.label}<span className="ml-2 text-xs font-normal text-stone-400">{table.capacity} seats</span></td><td className="px-6 py-4 text-stone-600">{table.zone}</td><td className="px-6 py-4"><StatusPill status={table.status} /></td><td className="px-6 py-4 font-medium text-stone-700">{turns || "No data"}</td><td className="px-6 py-4 text-stone-600">{averageDuration === null ? "No data" : `${averageDuration} min`}</td><td className="px-6 py-4 text-stone-600">{seatUtilization === null ? "No data" : `${seatUtilization}%`}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
