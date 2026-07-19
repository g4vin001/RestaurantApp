import type { TableStatus } from "@/lib/types";

export function formatLastUpdated(date: string) {
  return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" }).format(new Date(date));
}

export function statusClass(status: string) {
  const colours: Record<string, string> = {
    Available: "bg-emerald-100 text-emerald-800", Low: "bg-emerald-100 text-emerald-800",
    Moderate: "bg-amber-100 text-amber-800", Limited: "bg-amber-100 text-amber-800", Cleaning: "bg-amber-100 text-amber-800",
    Busy: "bg-rose-100 text-rose-800", Paused: "bg-rose-100 text-rose-800", Occupied: "bg-rose-100 text-rose-800",
    Reserved: "bg-sky-100 text-sky-800", Waiting: "bg-violet-100 text-violet-800", Seated: "bg-sky-100 text-sky-800", Cancelled: "bg-slate-200 text-slate-700",
  };
  return colours[status] ?? "bg-slate-100 text-slate-700";
}

export function isAvailable(status: TableStatus) { return status === "Available"; }
