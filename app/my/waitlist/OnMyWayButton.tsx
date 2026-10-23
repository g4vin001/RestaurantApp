"use client";

import { useActionState, useEffect, useState } from "react";
import { markOnMyWay } from "./actions";

export function OnMyWayButton({ queueId }: { queueId: string }) {
  const [state, action, pending] = useActionState(markOnMyWay, { error: "" });
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return <form action={action} className="mt-4">
    <input type="hidden" name="queueId" value={queueId} />
    <button disabled={pending || !online} className="min-h-11 w-full rounded-xl bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50">{pending ? "Sending…" : "On my way!"}</button>
    {!online && <p className="mt-2 text-sm text-amber-900">You&apos;re offline. Reconnect to let the host know.</p>}
    {state.error && <p role="alert" className="mt-2 text-sm text-red-700">{state.error}</p>}
  </form>;
}
