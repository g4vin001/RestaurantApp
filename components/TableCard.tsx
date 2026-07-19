import { PageCard } from "@/components/PageCard";
import { StatusBadge } from "@/components/StatusBadge";
import type { LayoutItem } from "@/lib/types";

export function TableCard({ item }: { item: LayoutItem }) {
  return <PageCard><div className="flex items-center justify-between"><div><h3 className="font-medium">{item.label}</h3><p className="text-sm text-stone-500">{item.type.replace("-", " ")} · {item.seatCount} seats</p></div><StatusBadge status={item.status} /></div><button className="mt-4 rounded-md border border-emerald-700 px-3 py-1.5 text-sm font-medium text-emerald-700">Update status</button></PageCard>;
}
