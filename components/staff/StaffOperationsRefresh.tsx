"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

type ConnectionState = "live" | "reconnecting" | "offline" | "stale";

export function StaffOperationsRefresh({ restaurantId }: { restaurantId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [connection, setConnection] = useState<ConnectionState>("reconnecting");
  const [remoteChange, setRemoteChange] = useState(false);

  const refresh = useCallback((changedElsewhere = false) => {
    if (!navigator.onLine) {
      setConnection("offline");
      return;
    }
    setConnection("reconnecting");
    startTransition(() => {
      router.refresh();
      setRemoteChange(changedElsewhere);
      setConnection("live");
    });
  }, [router]);

  useEffect(() => {
    const offline = () => setConnection("offline");
    const online = () => refresh(false);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    const supabase = createClient();
    const channel = supabase
      .channel(`restaurant:${restaurantId}`, { config: { private: true } })
      .on("broadcast", { event: "invalidated" }, () => refresh(true))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnection("live");
          refresh(false);
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnection(navigator.onLine ? "reconnecting" : "offline");
        }
        if (status === "CLOSED" && navigator.onLine) setConnection("stale");
      });
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      void supabase.removeChannel(channel);
    };
  }, [refresh, restaurantId]);

  const label = pending
    ? "Refreshing canonical state…"
    : connection === "live"
      ? remoteChange
        ? "Changed on another device"
        : "Live across devices"
      : connection === "offline"
        ? "Offline — reconnect before saving"
        : connection === "stale"
          ? "Stale — refresh required"
          : "Reconnecting…";

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-stone-600" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${connection === "live" ? "bg-emerald-500" : connection === "offline" ? "bg-rose-500" : "bg-amber-500"}`} aria-hidden="true" />
      <span>{label}</span>
      <button type="button" onClick={() => refresh(false)} disabled={pending || connection === "offline"} className="rounded-lg px-2 py-1 font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">Refresh</button>
    </div>
  );
}
