import Link from "next/link";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { PageCard } from "@/components/PageCard";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { CustomerRefresh } from "@/components/customer/CustomerRefresh";
import { WaitlistCancelForm } from "./WaitlistCancelForm";
import { formatScheduledAt } from "@/lib/helpers";
import { CustomerDataUnavailable } from "@/components/customer/CustomerDataUnavailable";
import { reportDataError } from "@/lib/server/data-error";

export default async function MyWaitlistPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/my/waitlist");

  const select = {
      id: true,
      partyName: true,
      partySize: true,
      status: true,
      promisedWaitMinutes: true,
      joinedAt: true,
      updatedAt: true,
      restaurant: { select: { name: true, slug: true, timezone: true } },
  } as const;
  // Show active work first, then a recent outcome instead of silently making
  // the customer's party disappear after staff seat or remove it.
  const scope = { createdById: user.id, source: "CUSTOMER" as const, restaurant: { environment: "LIVE" as const, archivedAt: null } };
  const loadEntry = async () => await prisma.queueEntry.findFirst({
    where: { ...scope, status: { in: ["WAITING", "CALLED"] } },
    orderBy: { joinedAt: "desc" }, select,
  }) ?? await prisma.queueEntry.findFirst({
    where: { ...scope, status: { in: ["SEATED", "CANCELLED", "NO_SHOW"] }, updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } },
    orderBy: { updatedAt: "desc" }, select,
  });
  let entry: Awaited<ReturnType<typeof loadEntry>>;
  try { entry = await loadEntry(); }
  catch (error) { return <CustomerDataUnavailable reference={reportDataError("customer-waitlist", error)} />; }
  const active = entry?.status === "WAITING" || entry?.status === "CALLED";
  const statusMessage = entry ? {
    WAITING: { title: "You're on the waitlist", detail: "Keep this page open to see when the host calls your party." },
    CALLED: { title: "Please approach the host", detail: "The restaurant has called your party. Check in with the host now. No SMS or push notification is sent." },
    SEATED: { title: "You're seated", detail: "The restaurant has marked your party seated. Enjoy your meal." },
    CANCELLED: { title: "Your waitlist entry was cancelled", detail: "You're no longer waiting. Contact the host if this was unexpected." },
    NO_SHOW: { title: "Please check with the host", detail: "Your party was marked as a no-show and is no longer waiting." },
  }[entry.status] : null;

  return (
    <main className="mx-auto max-w-lg px-5 py-14">
      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">My waitlist</p>
      <h1 className="mt-2 text-3xl font-bold">Current walk-in status</h1>
      <div className="mt-4"><CustomerRefresh key={entry?.restaurant.slug ?? "empty"} snapshotId={randomUUID()} checkedAt={new Date().toISOString()} slug={entry?.restaurant.slug} timeZone={entry?.restaurant.timezone} /></div>
      {!entry ? (
        <PageCard className="mt-6">
          <p className="text-sm text-stone-600">You do not have an active customer waitlist entry.</p>
          <Link href="/" className="mt-4 inline-flex text-sm font-semibold text-emerald-700">Browse restaurants</Link>
        </PageCard>
      ) : (
        <PageCard className="mt-6">
          <p className="text-sm text-stone-500">{entry.restaurant.name}</p>
          <div className="mt-2 flex items-center justify-between gap-4">
            <div><h2 className="text-xl font-bold">{entry.partyName} · {entry.partySize} guests</h2><p className="mt-1 text-sm text-stone-600">Joined {formatScheduledAt(entry.joinedAt.toISOString(), entry.restaurant.timezone)}</p></div>
          </div>
          <section role="status" aria-live="polite" aria-atomic="true" className={`mt-5 rounded-xl border p-4 ${entry.status === "CALLED" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-stone-200 bg-stone-50 text-stone-800"}`}>
            <h3 className="text-lg font-bold">{statusMessage?.title}</h3>
            <p className="mt-2 text-sm leading-6">{statusMessage?.detail}</p>
          </section>
          {active && <div className="mt-5 rounded-xl bg-stone-50 p-4">
            <p className="text-2xl font-bold">~{entry.promisedWaitMinutes} min</p>
            <p className="mt-1 text-xs leading-5 text-stone-600">Estimate when you joined, not a countdown. Party size and table fit can change your wait. Ask the host for an updated estimate.</p>
          </div>}
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={`/restaurants/${entry.restaurant.slug}`} className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold">Restaurant page</Link>
            {active && <WaitlistCancelForm queueId={entry.id} />}
          </div>
        </PageCard>
      )}
    </main>
  );
}
