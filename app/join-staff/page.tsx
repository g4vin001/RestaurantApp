import { PageCard } from "@/components/PageCard";
import { redeemStaffCode } from "./actions";

export default async function JoinStaffCodePage({ searchParams }: { searchParams: Promise<{ error?: string; code?: string }> }) {
  const { error, code } = await searchParams;
  return (
    <main className="mx-auto max-w-md px-5 py-14">
      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Staff access</p>
      <h1 className="mt-2 text-3xl font-bold">Enter restaurant code</h1>
      <p className="mt-2 text-sm leading-6 text-stone-600">Use the temporary code provided by the restaurant manager. You may be asked to sign in before the code is redeemed.</p>
      <PageCard className="mt-6">
        <form action={redeemStaffCode} className="space-y-4">
          <label className="block text-sm font-medium">Staff code<input name="code" required defaultValue={code ?? ""} autoCapitalize="characters" className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 font-mono text-lg uppercase tracking-widest" /></label>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button className="min-h-11 w-full rounded-xl bg-emerald-800 px-4 font-semibold text-white">Continue</button>
        </form>
      </PageCard>
    </main>
  );
}
