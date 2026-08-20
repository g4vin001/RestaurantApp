"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

const REFRESH_INTERVAL_MS = 10_000;

export function PublicLiveRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const refresh = () => {
    startTransition(() => router.refresh());
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [router]);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
      <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
        <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
        Live status
      </span>
      <span>updates about every 10 seconds</span>
      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        className="rounded-lg px-2 py-1 font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
      >
        {pending ? "Refreshing…" : "Refresh now"}
      </button>
    </div>
  );
}
