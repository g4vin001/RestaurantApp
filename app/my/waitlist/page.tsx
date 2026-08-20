import Link from "next/link";
import { redirect } from "next/navigation";
import { PageCard } from "@/components/PageCard";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { cancelMyWaitlist } from "./actions";

export default async function MyWaitlistPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/my/waitlist");

  const entry = await prisma.queueEntry.findFirst({
    where: { createdById: user.id, source: "CUSTOMER", status: { in: ["WAITING", "CALLED"] } },
    orderBy: { joinedAt: "desc" },
    select: {
      id: true,
      partyName: true,
      partySize: true,
      status: true,
      promisedWaitMinutes: true,
      joinedAt: true,
      restaurant: { select: { name: true, slug: true } },
    },
  });

  return (
    <main className="mx-auto max-w-lg px-5 py-14">
      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">My waitlist</p>
      <h1 className="mt-2 text-3xl font-bold">Current walk-in status</h1>
      {!entry ? (
        <PageCard className="mt-6">
          <p className="text-sm text-stone-600">You do not have an active customer waitlist entry.</p>
          <Link href="/" className="mt-4 inline-flex text-sm font-semibold text-emerald-700">Browse restaurants</Link>
        </PageCard>
      ) : (
        <PageCard className="mt-6">
          <p className="text-sm text-stone-500">{entry.restaurant.name}</p>
          <div className="mt-2 flex items-center justify-between gap-4">
            <div><h2 className="text-xl font-bold">{entry.partyName} · {entry.partySize}</h2><p className="mt-1 text-sm text-stone-600">Joined {entry.joinedAt.toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</p></div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${entry.status === "CALLED" ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>{entry.status === "CALLED" ? "TABLE CALL" : "WAITING"}</span>
          </div>
          <div className="mt-5 rounded-xl bg-stone-50 p-4">
            <p className="text-2xl font-bold">~{entry.promisedWaitMinutes} min</p>
            <p className="text-xs text-stone-500">initial estimated wait; not a guaranteed queue position</p>
          </div>
          {entry.status === "CALLED" && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">The restaurant marked your party called. Please approach the host soon. This status does not mean an SMS was sent.</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={`/restaurants/${entry.restaurant.slug}`} className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold">Restaurant page</Link>
            <form action={cancelMyWaitlist}><input type="hidden" name="queueId" value={entry.id} /><button className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700">Leave waitlist</button></form>
          </div>
        </PageCard>
      )}
    </main>
  );
}
