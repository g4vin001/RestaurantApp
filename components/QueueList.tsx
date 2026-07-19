import { PageCard } from "@/components/PageCard";
import { StatusBadge } from "@/components/StatusBadge";
import type { QueueEntry } from "@/lib/types";

export function QueueList({ entries, showActions = false }: { entries: QueueEntry[]; showActions?: boolean }) {
  return <div className="space-y-3">{entries.map((entry) => <PageCard key={entry.id}><div className="flex items-center justify-between gap-3"><div><h3 className="font-medium">{entry.customerName}</h3><p className="text-sm text-stone-500">{entry.groupSize} guests · arrived {entry.arrivalTime}</p></div><StatusBadge status={entry.status} /></div>{showActions && <div className="mt-3 flex gap-2"><button className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm text-white">Mark seated</button><button className="rounded-md border border-stone-300 px-3 py-1.5 text-sm">Cancel</button></div>}</PageCard>)}</div>;
}
