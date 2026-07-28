import { PageCard } from "@/components/PageCard";
import { readFlash } from "@/lib/flash";
import { AuthForms } from "./AuthForms";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;
  const [notice, error, message] = await Promise.all([
    readFlash("notice"),
    readFlash("error"),
    readFlash("message"),
  ]);

  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="text-2xl font-bold text-emerald-800">Log in or sign up</h1>
      <p className="mt-1 text-sm text-stone-600">Customers, managers, and staff all start here.</p>
      <PageCard className="mt-6">
        {notice && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p>}
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {message && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}
        <AuthForms redirectTo={redirectTo} />
      </PageCard>
    </main>
  );
}
