"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function CustomerDataUnavailable({ reference }: { reference: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <main className="mx-auto max-w-lg px-5 py-12">
    <section role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
      <h1 className="text-2xl font-bold text-stone-950">We couldn&apos;t check the latest status</h1>
      <p className="mt-3 text-sm leading-6 text-stone-700">Check your connection and try again. If you&apos;re at the restaurant, ask the host for the latest availability.</p>
      <button disabled={pending} onClick={() => startTransition(() => router.refresh())} className="mt-5 min-h-11 rounded-xl bg-emerald-800 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Checking…" : "Try again"}</button>
      <p className="mt-4 text-xs text-stone-600">Support reference: {reference}</p>
    </section>
  </main>;
}
