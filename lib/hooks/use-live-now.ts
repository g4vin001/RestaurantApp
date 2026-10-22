"use client";

import { useEffect, useState } from "react";

// Flips after the first client render commits. Before that, a component may be
// hydrating server HTML, so it must render with the server's clock or any
// elapsed-minute text can differ and break hydration. Later mounts (client
// navigation) have no server HTML to match and use the real time.
let hydrated = false;

export function useLiveNow(intervalMs: number, resetKey?: string, serverNow?: string) {
  const [now, setNow] = useState(() =>
    !hydrated && serverNow ? new Date(serverNow) : new Date(),
  );

  useEffect(() => {
    hydrated = true;
  }, []);

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
