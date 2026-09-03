"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useTransition } from "react";

const REFRESH_INTERVAL_MS = 12_000;

export function PublicHomeRefresh() {
  const router = useRouter();
  const [, startTransition] = useTransition();
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

  return null;
}
