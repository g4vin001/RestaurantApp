import { PageCard } from "@/components/PageCard";
import type { AnalyticsSummary as Summary } from "@/lib/types";

export function AnalyticsSummary({ summary }: { summary: Summary }) {
  const stats = [["Total tables", summary.totalTables], ["Occupied", summary.occupiedTables], ["Available", summary.availableTables], ["Occupancy", `${summary.occupancyRate}%`], ["Avg. wait", `${summary.averageWaitMinutes} min`], ["Groups waiting", summary.groupsWaiting]];
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{stats.map(([label, value]) => <PageCard key={label as string}><p className="text-sm text-stone-500">{label}</p><p className="mt-1 text-2xl font-bold text-emerald-800">{value}</p></PageCard>)}</div>;
}
