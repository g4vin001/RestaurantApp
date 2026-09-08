"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, useTransition, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { initialStaffConnection, staffConnectionReducer, type StaffConnectionState } from "@/lib/realtime/staff-connection";
import type { SeatingRecommendationState } from "@/lib/domain/operations";

const StaffConnectionContext = createContext<{
  state: StaffConnectionState;
  refresh: () => void;
} | null>(null);
const StaffSeatingContext = createContext<{ state: SeatingRecommendationState; now: number } | null>(null);

/** One subscription per workspace; desktop and mobile share the same status. */
export function StaffOperationsProvider({ restaurantId, snapshotId, seating, children }: {
  restaurantId: string; snapshotId: string;
  seating: { state: SeatingRecommendationState; now: number };
  children: ReactNode;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [state, dispatch] = useReducer(staffConnectionReducer, initialStaffConnection);
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);
  const queued = useRef(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshot = useRef(snapshotId);

  const requestRefresh = useCallback((changedElsewhere = false) => {
    if (!navigator.onLine) { dispatch({ type: "OFFLINE" }); return; }
    if (inFlight.current) { queued.current = true; return; }
    inFlight.current = true;
    dispatch({ type: "REFRESH_STARTED", changedElsewhere });
    timeout.current = setTimeout(() => {
      inFlight.current = false;
      queued.current = false;
      dispatch({ type: "REFRESH_FAILED" });
    }, 20_000);
    startTransition(() => router.refresh());
    // router.refresh() returns void. Only a new server snapshot confirms success.
  }, [router]);

  useEffect(() => {
    if (lastSnapshot.current === snapshotId) return;
    lastSnapshot.current = snapshotId;
    if (timeout.current) clearTimeout(timeout.current);
    inFlight.current = false;
    dispatch({ type: "SNAPSHOT_RECEIVED" });
    if (queued.current) {
      queued.current = false;
      requestRefresh(true);
    }
  }, [snapshotId, requestRefresh]);

  useEffect(() => {
    let disposed = false;
    const offline = () => {
      if (timeout.current) clearTimeout(timeout.current);
      inFlight.current = false;
      queued.current = false;
      dispatch({ type: "OFFLINE" });
    };
    const online = () => setAttempt((value) => value + 1);
    const visible = () => {
      if (document.visibilityState === "visible") requestRefresh();
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    const supabase = createClient();
    dispatch({ type: navigator.onLine ? "CONNECTING" : "OFFLINE" });
    const channel = supabase
      .channel(`restaurant:${restaurantId}`, { config: { private: true } })
      .on("broadcast", { event: "invalidated" }, () => { if (!disposed) requestRefresh(true); })
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          dispatch({ type: "SUBSCRIBED" });
          requestRefresh();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          dispatch({ type: navigator.onLine ? "CHANNEL_ERROR" : "OFFLINE" });
        } else if (status === "CLOSED") {
          dispatch({ type: navigator.onLine ? "CLOSED" : "OFFLINE" });
        }
      });
    return () => {
      disposed = true;
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
      void supabase.removeChannel(channel);
    };
  }, [restaurantId, attempt, requestRefresh]);

  useEffect(() => () => { if (timeout.current) clearTimeout(timeout.current); }, []);

  const refresh = () => {
    if (state.channel !== "subscribed") setAttempt((value) => value + 1);
    requestRefresh();
  };
  return <StaffConnectionContext.Provider value={{ state, refresh }}>
    <StaffSeatingContext.Provider value={seating}>{children}</StaffSeatingContext.Provider>
  </StaffConnectionContext.Provider>;
}

export function useStaffConnection() {
  const context = useContext(StaffConnectionContext);
  if (!context) throw new Error("Staff connection requires its workspace provider.");
  return context;
}

export function useStaffSeating() {
  const context = useContext(StaffSeatingContext);
  if (!context) throw new Error("Staff seating requires its workspace provider.");
  return context;
}
