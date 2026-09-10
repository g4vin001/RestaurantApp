"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { CUSTOMER_FRESHNESS_MS, customerConnectionStatus, type CustomerConnection } from "@/lib/realtime/customer-connection";

export type CustomerRefreshProps = {
  snapshotId: string;
  checkedAt: string;
  slug?: string;
  intervalMs?: number;
  timeZone?: string;
};

/** Broadcasts only trigger reads; no customer records travel over public channels. */
export function CustomerRefresh({ snapshotId, checkedAt, slug, intervalMs = 10_000, timeZone = "Asia/Manila" }: CustomerRefreshProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(Date.parse(checkedAt));
  const [connection, setConnection] = useState<CustomerConnection>({
    online: true, channel: slug ? "connecting" : "polling", refreshing: false,
    failed: false, confirmed: false, checkedAt: Date.parse(checkedAt),
  });
  const previousSnapshot = useRef(snapshotId);
  const inFlight = useRef(false);
  const queued = useRef(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback((queueIfBusy = true) => {
    if (!navigator.onLine) {
      setConnection((value) => ({ ...value, online: false, confirmed: false }));
      return;
    }
    if (inFlight.current) { if (queueIfBusy) queued.current = true; return; }
    inFlight.current = true;
    setConnection((value) => ({ ...value, online: true, refreshing: true }));
    timeout.current = setTimeout(() => {
      inFlight.current = false;
      queued.current = false;
      setConnection((value) => ({ ...value, refreshing: false, failed: true }));
    }, 20_000);
    startTransition(() => router.refresh());
    // router.refresh returns void; only new server props confirm a response.
  }, [router]);

  useEffect(() => {
    if (previousSnapshot.current === snapshotId) return;
    previousSnapshot.current = snapshotId;
    if (!inFlight.current || !navigator.onLine) return;
    if (timeout.current) clearTimeout(timeout.current);
    inFlight.current = false;
    const timestamp = Date.parse(checkedAt);
    const fresh = Number.isFinite(timestamp) && Date.now() - timestamp <= CUSTOMER_FRESHNESS_MS;
    setConnection((value) => ({ ...value, refreshing: false, confirmed: fresh, failed: !fresh, checkedAt: timestamp }));
    setNow(Date.now());
    if (queued.current) { queued.current = false; refresh(); }
  }, [snapshotId, checkedAt, refresh]);

  useEffect(() => {
    let disposed = false;
    const offline = () => {
      if (timeout.current) clearTimeout(timeout.current);
      inFlight.current = false;
      queued.current = false;
      setConnection((value) => ({ ...value, online: false, refreshing: false, confirmed: false }));
    };
    const online = () => setAttempt((value) => value + 1);
    const visible = () => { if (document.visibilityState === "visible") refresh(false); };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(visible, intervalMs);
    const clock = window.setInterval(() => setNow(Date.now()), 5_000);
    setConnection((value) => ({ ...value, online: navigator.onLine, confirmed: false, channel: slug ? "connecting" : "polling" }));
    refresh(false);
    let removeChannel = () => {};
    if (slug) void import("@/lib/supabase/client").then(({ createClient }) => {
      if (disposed) return;
      const supabase = createClient();
      const channel = supabase.channel(`public-restaurant:${slug}`)
      .on("broadcast", { event: "invalidated" }, () => { if (!disposed) refresh(); })
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          setConnection((value) => ({ ...value, channel: "subscribed", confirmed: false }));
          refresh();
        } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
          setConnection((value) => ({ ...value, channel: "error" }));
        }
      });
      removeChannel = () => { void supabase.removeChannel(channel); };
    }).catch(() => { if (!disposed) setConnection((value) => ({ ...value, channel: "error" })); });
    return () => {
      disposed = true;
      clearInterval(timer);
      clearInterval(clock);
      if (timeout.current) clearTimeout(timeout.current);
      inFlight.current = false;
      queued.current = false;
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
      removeChannel();
    };
  }, [slug, intervalMs, attempt, refresh]);

  const status = customerConnectionStatus(connection, now);
  const label = {
    offline: "Offline — showing the last checked status",
    stale: "Updates unconfirmed — retry",
    checking: "Checking for updates…",
    live: "Live updates connected",
    current: "Status checked",
    periodic: "Periodic updates — live connection reconnecting",
  }[status];
  const healthy = status === "live" || status === "current";
  return <section aria-label="Customer updates" className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p role="status" className={`flex items-center gap-2 font-semibold ${healthy ? "text-emerald-800" : "text-amber-800"}`}>
        {status === "offline" ? <WifiOff size={15} /> : <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${healthy ? "bg-emerald-600" : "bg-amber-500"}`} />}
        {label}
      </p>
      <button type="button" disabled={connection.refreshing || !connection.online} onClick={() => {
        if (slug && connection.channel !== "subscribed") setAttempt((value) => value + 1);
        else refresh();
      }} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">
        <RefreshCw size={14} className={connection.refreshing ? "animate-spin" : ""} />
        {connection.refreshing ? "Checking…" : "Refresh now"}
      </button>
    </div>
    <p className="mt-1 leading-5 text-stone-600">
      Last checked <time dateTime={checkedAt}>{new Intl.DateTimeFormat("en-PH", { timeZone, hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(checkedAt))}</time>.
      {" "}Checks about every {intervalMs / 1_000} seconds while this page is open. Connection delays can affect updates.
    </p>
  </section>;
}
