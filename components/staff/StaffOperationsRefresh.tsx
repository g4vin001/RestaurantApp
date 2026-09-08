"use client";

import { staffConnectionStatus } from "@/lib/realtime/staff-connection";
import { useStaffConnection } from "./StaffOperationsProvider";

export function StaffOperationsRefresh({
  inverse = false,
}: {
  inverse?: boolean;
}) {
  const { state, refresh } = useStaffConnection();
  const connection = staffConnectionStatus(state);
  const label = connection === "offline" ? "Offline — reconnect before saving"
    : connection === "stale" ? "Updates unconfirmed — retry refresh"
      : connection === "refreshing" ? "Updating floor and guests…"
        : connection === "live" ? state.changedElsewhere ? "Updated from another device" : "Live across devices"
          : "Reconnecting to live updates…";

  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs ${inverse ? "text-emerald-100" : "text-stone-600"}`} aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${connection === "live" ? "bg-emerald-500" : connection === "offline" ? "bg-rose-500" : "bg-amber-500"}`} aria-hidden="true" />
      <span>{label}</span>
      <button type="button" onClick={refresh} disabled={state.refreshing || !state.online} className={`min-h-11 rounded-lg px-3 font-semibold disabled:opacity-50 ${inverse ? "text-white hover:bg-white/10" : "text-emerald-800 hover:bg-emerald-50"}`}>Refresh</button>
    </div>
  );
}
