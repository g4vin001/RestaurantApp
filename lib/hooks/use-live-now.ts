"use client";

import { useEffect, useState } from "react";

export function useLiveNow(intervalMs: number, resetKey?: string) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: number | undefined;
    const tick = () => setNow(new Date());
    const start = () => {
      if (timer !== undefined || document.visibilityState !== "visible") return;
      timer = window.setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (timer === undefined) return;
      window.clearInterval(timer);
      timer = undefined;
    };
    const visibilityChanged = () => {
      if (document.visibilityState === "visible") {
        tick();
        start();
      } else stop();
    };

    tick();
    start();
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [intervalMs, resetKey]);

  return now;
}
