import type { TableStatus } from "@/lib/domain/types";
import { tableStatusLabel } from "@/lib/domain/transitions";

const styles: Record<TableStatus, string> = {
  AVAILABLE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  HELD: "border-sky-200 bg-sky-50 text-sky-700",
  RESERVED: "border-violet-200 bg-violet-50 text-violet-700",
  OCCUPIED: "border-rose-200 bg-rose-50 text-rose-700",
  CLEANING: "border-amber-200 bg-amber-50 text-amber-800",
  OUT_OF_SERVICE: "border-stone-300 bg-stone-100 text-stone-700",
};

export function StatusPill({ status }: { status: TableStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[status]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {tableStatusLabel(status)}
    </span>
  );
}
