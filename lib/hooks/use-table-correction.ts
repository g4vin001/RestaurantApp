"use client";

import { useEffect, useState } from "react";
import { CORRECTION_WINDOW_MS, tableCorrectionEligibility, type CorrectionEvent } from "@/lib/domain/table-correction";
import type { TableStatus } from "@/lib/domain/types";

export function useTableCorrection(status: TableStatus, event: CorrectionEvent | null | undefined, initialNow: number) {
  const [now, setNow] = useState(initialNow);
  const occurredAt = event?.occurredAt;
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const expiresAt = Date.parse(occurredAt ?? "") + CORRECTION_WINDOW_MS;
    const remaining = expiresAt - Date.now();
    const timer = Number.isFinite(remaining) && remaining >= 0
      ? window.setTimeout(update, remaining + 1)
      : undefined;
    // Recheck immediately when returning from a suspended/backgrounded tab.
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [occurredAt, initialNow]);
  return tableCorrectionEligibility(status, event, Math.max(now, initialNow));
}
