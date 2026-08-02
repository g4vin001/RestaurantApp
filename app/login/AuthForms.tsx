"use client";

import { useState } from "react";
import { login, signup } from "./actions";

type Mode = "login" | "register";

const inputClass =
  "mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm";
const labelClass = "text-sm font-medium text-stone-700";

export function AuthForms({ redirectTo }: { redirectTo?: string }) {
  const [mode, setMode] = useState<Mode>("login");

  return (
    <div>
      <div className="mb-5 flex gap-2 border-b border-stone-200">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`-mb-px border-b-2 px-1 pb-2 text-sm font-semibold ${mode === "login" ? "border-emerald-700 text-emerald-700" : "border-transparent text-stone-400"}`}
        >
          Log in
        </button>
        <button
          type="button"
          onClick={() => setMode("register")}
          className={`-mb-px border-b-2 px-1 pb-2 text-sm font-semibold ${mode === "register" ? "border-emerald-700 text-emerald-700" : "border-transparent text-stone-400"}`}
        >
          Register
        </button>
      </div>

      {mode === "login" ? (
        <form className="flex flex-col gap-3" action={login}>
          {redirectTo && (
            <input type="hidden" name="redirectTo" value={redirectTo} />
          )}
          <label className={labelClass}>
            Email
            <input name="email" type="email" required className={inputClass} />
          </label>
          <label className={labelClass}>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={6}
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white"
          >
            Log in
          </button>
        </form>
      ) : (
        <form className="flex flex-col gap-3" action={signup}>
          <label className={labelClass}>
            Display name
            <input name="displayName" required className={inputClass} />
          </label>
          <label className={labelClass}>
            Email
            <input name="email" type="email" required className={inputClass} />
          </label>
          <label className={labelClass}>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={6}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Confirm password
            <input
              name="confirmPassword"
              type="password"
              required
              minLength={6}
              className={inputClass}
            />
          </label>
          <p className="rounded-lg bg-stone-50 p-3 text-xs leading-5 text-stone-500">
            This creates a customer account. Restaurant managers and staff are
            added through the restaurant workspace.
          </p>
          <button
            type="submit"
            className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white"
          >
            Create account
          </button>
        </form>
      )}
    </div>
  );
}
