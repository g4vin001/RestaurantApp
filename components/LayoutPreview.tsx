import { StatusBadge } from "@/components/StatusBadge";
import type { LayoutItem } from "@/lib/types";

export function LayoutPreview({ items }: { items: LayoutItem[] }) {
  return <div className="relative min-h-80 overflow-hidden rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 p-4">
    {items.map((item) => <div key={item.id} style={{ left: `${item.x}%`, top: `${item.y}%` }} className="absolute w-28 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-stone-200 bg-white p-2 text-center shadow-sm"><p className="text-xs font-semibold">{item.label}</p><p className="my-1 text-xs text-stone-500">{item.seatCount} seats</p><StatusBadge status={item.status} /></div>)}
  </div>;
}
