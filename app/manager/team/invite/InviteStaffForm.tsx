"use client";

import { useActionState } from "react";
import { createStaffInvite, type InviteStaffState } from "./actions";

const initialState: InviteStaffState = {};
const inputClass = "mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5";

export function InviteStaffForm() {
  const [state, action, pending] = useActionState(createStaffInvite, initialState);
  if (state.inviteUrl && state.shortCode) {
    return (
      <div className="space-y-4">
        <p className="text-sm font-semibold text-emerald-800">Invite created for {state.staffName}.</p>
        <div className="rounded-xl bg-stone-50 p-4">
          <p className="text-xs uppercase tracking-wide text-stone-500">Invite link</p>
          <code className="mt-1 block break-all text-sm">{state.inviteUrl}</code>
          <p className="mt-4 text-xs uppercase tracking-wide text-stone-500">Manual code</p>
          <code className="mt-1 block text-xl font-bold tracking-widest">{state.shortCode}</code>
        </div>
        <p className="text-xs leading-5 text-stone-500">Single-use and expires after 24 hours. The link can be encoded as a QR code later without changing the backend.</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm font-medium">Name<input name="name" required maxLength={80} className={inputClass} /></label>
      <label className="block text-sm font-medium">Job title<input name="jobTitle" required maxLength={80} className={inputClass} /></label>
      <label className="block text-sm font-medium">Access preset<select name="permissionPreset" className={inputClass}><option value="HOST">Host</option><option value="FLOOR_STAFF">Floor staff</option></select></label>
      {state.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
      <button disabled={pending} className="min-h-11 w-full rounded-xl bg-emerald-800 px-4 font-semibold text-white disabled:opacity-60">{pending ? "Creating…" : "Create staff invite"}</button>
    </form>
  );
}
