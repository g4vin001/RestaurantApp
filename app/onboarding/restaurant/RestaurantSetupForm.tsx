"use client";

import { useActionState } from "react";
import {
  createRestaurantForOwner,
  type RestaurantSetupState,
} from "./actions";

const initialState: RestaurantSetupState = {};

export function RestaurantSetupForm() {
  const [state, action, pending] = useActionState(
    createRestaurantForOwner,
    initialState,
  );

  return (
    <form action={action} className="mt-6 space-y-4">
      <label className="block text-sm font-medium text-stone-700">
        Restaurant name
        <input
          name="name"
          required
          minLength={2}
          maxLength={80}
          autoComplete="organization"
          className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
        />
      </label>

      <label className="block text-sm font-medium text-stone-700">
        City or location
        <input
          name="location"
          maxLength={120}
          autoComplete="address-level2"
          placeholder="e.g. Quezon City"
          className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
        />
      </label>

      {state.error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Creating restaurant…" : "Create restaurant"}
      </button>
    </form>
  );
}
