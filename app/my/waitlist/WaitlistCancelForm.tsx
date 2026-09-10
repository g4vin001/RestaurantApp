"use client";

import { useActionState, useEffect, useState } from "react";
import { cancelMyWaitlist } from "./actions";

export function WaitlistCancelForm({ queueId }: { queueId: string }) {
  const [state, action, pending] = useActionState(cancelMyWaitlist, { error: "" });
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return <form action={action}>
    <input type="hidden" name="queueId" value={queueId} />
    <button disabled={pending || !online} className="min-h-11 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">{pending ? "Leaving…" : "Leave waitlist"}</button>
    {state.error && <p role="alert" className="mt-2 max-w-xs text-sm text-red-700">{state.error}</p>}
  </form>;
}
