"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useTransition } from "react";

const REFRESH_INTERVAL_MS = 15_000;

export function CustomerReservationsRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setInterval(refreshWhenVisible, REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={pending}
      className="text-sm font-semibold text-emerald-700 disabled:opacity-50"
    >
      {pending ? "Refreshing…" : "Refresh status"}
    </button>
  );
}
