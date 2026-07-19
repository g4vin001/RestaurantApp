import { statusClass } from "@/lib/helpers";

export function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}>{status}</span>;
}
