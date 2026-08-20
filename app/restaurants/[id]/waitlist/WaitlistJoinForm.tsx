"use client";

import { useActionState } from "react";
import { joinCustomerWaitlist, type WaitlistJoinState } from "./actions";

const initialState: WaitlistJoinState = {};
const inputClass = "mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5";

export function WaitlistJoinForm({ slug, defaultPartyName }: { slug: string; defaultPartyName: string }) {
  const action = joinCustomerWaitlist.bind(null, slug);
  const [state, submit, pending] = useActionState(action, initialState);
  return (
    <form action={submit} className="space-y-4">
      <label className="block text-sm font-medium">Party name<input name="partyName" required maxLength={80} defaultValue={defaultPartyName} className={inputClass} /></label>
      <label className="block text-sm font-medium">Party size<input name="partySize" type="number" required min={1} max={30} defaultValue={2} className={inputClass} /></label>
      <label className="block text-sm font-medium">Contact <span className="font-normal text-stone-400">(optional)</span><input name="contact" maxLength={120} className={inputClass} /></label>
      {state.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
      <button disabled={pending} className="min-h-11 w-full rounded-xl bg-emerald-800 px-4 font-semibold text-white disabled:opacity-60">{pending ? "Joining…" : "Join waitlist"}</button>
      <p className="text-xs leading-5 text-stone-500">Wait times are estimates, not guaranteed queue positions. Larger parties may wait longer for a suitable table.</p>
    </form>
  );
}
