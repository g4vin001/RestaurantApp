"use client";

import Link from "next/link";
import { useState } from "react";
import { login, signup } from "./actions";

type Mode = "login" | "register";

const inputClass =
  "mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm";
const labelClass = "text-sm font-medium text-stone-700";

export function AuthForms({
  redirectTo,
  defaultEmail,
}: {
  redirectTo?: string;
  defaultEmail?: string;
}) {
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
        <div className="space-y-3">
          <form className="flex flex-col gap-3" action={login}>
            {redirectTo && (
              <input type="hidden" name="redirectTo" value={redirectTo} />
            )}
            <label className={labelClass}>
              Email
              <input name="email" type="email" required defaultValue={defaultEmail} className={inputClass} />
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
            <Link
              href="/forgot-password"
              className="-mt-1 self-end text-xs font-semibold text-emerald-700 underline-offset-4 hover:underline"
            >
              Forgot your password?
            </Link>
            <button
              type="submit"
              className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white"
            >
              Log in
            </button>
          </form>
        </div>
      ) : (
        <form className="flex flex-col gap-3" action={signup}>
          {redirectTo && (
            <input type="hidden" name="redirectTo" value={redirectTo} />
          )}
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
