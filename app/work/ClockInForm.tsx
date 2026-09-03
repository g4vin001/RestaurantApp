"use client";

import { useActionState, useState } from "react";
import { clockIn, type ClockInState } from "./actions";

const initialState: ClockInState = {};

export function ClockInForm({
  restaurantId,
  pinConfigured,
}: {
  restaurantId: string;
  pinConfigured: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(clockIn, initialState);

  if (!pinConfigured) {
    return (
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-800">
        Your manager still needs to configure this restaurant&apos;s 4-digit staff PIN.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900"
      >
        Clock in
      </button>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <label className="block text-sm font-semibold text-stone-700">
        Restaurant PIN
        <input
          autoFocus
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]{4}"
          minLength={4}
          maxLength={4}
          autoComplete="off"
          required
          className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-center text-xl tracking-[0.45em] text-stone-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          placeholder="••••"
        />
      </label>
      <p className="text-xs leading-5 text-stone-500">
        This is the internally agreed PIN for the restaurant. Your personal Halina account already identifies you.
      </p>
      {state.error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 flex-1 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "Clocking in…" : "Enter work mode"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-semibold text-stone-600"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
