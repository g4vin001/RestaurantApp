import Link from "next/link";
import { PageCard } from "@/components/PageCard";
import { ClearFlash } from "@/components/ui/ClearFlash";
import { readFlash } from "@/lib/flash";
import { requestPasswordReset } from "@/app/login/actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;
  const [flashError, message] = await Promise.all([
    readFlash("error"),
    readFlash("message"),
  ]);
  const error = flashError ?? (expired
    ? "That reset link has expired or was already used. Request a new one below."
    : undefined);

  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="text-2xl font-bold text-emerald-800">Forgot your password?</h1>
      <p className="mt-1 text-sm text-stone-600">
        Enter the email you use for Halina and we&apos;ll send you a link to set a new password.
      </p>
      <PageCard className="mt-6">
        <ClearFlash />
        {error &&<p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {message ? (
          <div role="status" className="space-y-3">
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>
            <p className="text-sm leading-6 text-stone-600">
              Didn&apos;t get it? Check your spam folder, or wait a minute and send another.
            </p>
          </div>
        ) : (
          <form action={requestPasswordReset} className="flex flex-col gap-3">
            <label className="text-sm font-medium text-stone-700">
              Email
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white"
            >
              Send reset link
            </button>
          </form>
        )}
        <Link href="/login" className="mt-5 inline-flex text-sm font-semibold text-emerald-700">
          ← Back to log in
        </Link>
      </PageCard>
    </main>
  );
}
