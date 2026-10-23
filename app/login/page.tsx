import { PageCard } from "@/components/PageCard";
import { ClearFlash } from "@/components/ui/ClearFlash";
import { readUnconfirmedEmail } from "@/lib/auth/pending-confirmation";
import { readFlash } from "@/lib/flash";
import { resendConfirmation } from "./actions";
import { AuthForms } from "./AuthForms";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;
  const [notice, error, message, unconfirmedEmail] = await Promise.all([
    readFlash("notice"),
    readFlash("error"),
    readFlash("message"),
    readUnconfirmedEmail(),
  ]);

  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="text-2xl font-bold text-emerald-800">Log in or sign up</h1>
      <p className="mt-1 text-sm text-stone-600">
        Customers can create an account. Restaurant managers can sign in with
        an account that already has manager access.
      </p>
      <PageCard className="mt-6">
        <ClearFlash />
        {notice &&<p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p>}
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {message && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}
        {unconfirmedEmail && (
          <form action={resendConfirmation} className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
            <p>
              <span className="font-semibold">{unconfirmedEmail}</span> hasn&apos;t been confirmed yet. Didn&apos;t get the email, or the link expired?
            </p>
            <button
              type="submit"
              className="mt-2 w-full rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-800"
            >
              Resend confirmation email
            </button>
          </form>
        )}
        <AuthForms redirectTo={redirectTo} defaultEmail={unconfirmedEmail} />
      </PageCard>
    </main>
  );
}
