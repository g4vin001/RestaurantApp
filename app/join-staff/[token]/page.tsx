import { redirect } from "next/navigation";
import { PageCard } from "@/components/PageCard";
import { createClient } from "@/lib/supabase/server";
import { redeemStaffInvite } from "./actions";

export default async function JoinStaffPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(`/join-staff/${token}`)}`);

  const action = redeemStaffInvite.bind(null, token);
  return (
    <main className="mx-auto max-w-md px-5 py-14">
      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Staff access</p>
      <h1 className="mt-2 text-3xl font-bold">Join restaurant operations</h1>
      <p className="mt-2 text-sm leading-6 text-stone-600">Redeeming this invite gives this account restricted Live Floor and Queue access. It does not grant analytics, layout, Team, settings, or owner controls.</p>
      <PageCard className="mt-6">
        {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <form action={action}>
          <button className="min-h-11 w-full rounded-xl bg-emerald-800 px-4 font-semibold text-white">Accept staff invite</button>
        </form>
      </PageCard>
    </main>
  );
}
