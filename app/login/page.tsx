import { PageCard } from "@/components/PageCard";
import { login, signup } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; redirectTo?: string }>;
}) {
  const { error, message, redirectTo } = await searchParams;

  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="text-2xl font-bold text-emerald-800">Staff login</h1>
      <p className="mt-1 text-sm text-stone-600">Sign in to manage the waitlist and floor.</p>
      <PageCard className="mt-6">
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {message && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}
        <form className="flex flex-col gap-3">
          <input type="hidden" name="redirectTo" value={redirectTo ?? "/manager"} />
          <label className="text-sm font-medium text-stone-700">
            Email
            <input name="email" type="email" required className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm font-medium text-stone-700">
            Password
            <input name="password" type="password" required minLength={6} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          </label>
          <button formAction={login} className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">
            Log in
          </button>
          <button formAction={signup} className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700">
            Sign up
          </button>
        </form>
      </PageCard>
    </main>
  );
}
