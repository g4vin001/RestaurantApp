import { redirect } from "next/navigation";
import { PageCard } from "@/components/PageCard";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { getActiveStaffAccess } from "@/lib/staff/access";
import { TABLE_TRANSITIONS, tableStatusLabel } from "@/lib/domain/transitions";
import { transitionStaffTable, updateStaffQueueStatus } from "./actions";

export default async function StaffOperationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/ops");
  const access = await getActiveStaffAccess(user.id);
  if (!access || !access.staffRecord) redirect("/");

  const [tables, queue] = await Promise.all([
    prisma.diningTable.findMany({
      where: { restaurantId: access.restaurantId, active: true, archivedAt: null },
      orderBy: [{ zone: "asc" }, { label: "asc" }],
      select: { id: true, label: true, capacity: true, zone: true, currentStatus: true },
    }),
    prisma.queueEntry.findMany({
      where: { restaurantId: access.restaurantId, status: { in: ["WAITING", "CALLED"] } },
      orderBy: { joinedAt: "asc" },
      select: { id: true, partyName: true, partySize: true, status: true, promisedWaitMinutes: true, joinedAt: true },
    }),
  ]);
  const isHost = access.staffRecord.permissionPreset === "HOST";

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Restricted operations</p>
      <h1 className="mt-2 text-3xl font-bold">{access.restaurant.name}</h1>
      <p className="mt-2 text-sm text-stone-600">Signed in as {access.staffRecord.name} · {access.staffRecord.jobTitle}. This staff view intentionally excludes analytics, floor editing, Team, settings, and owner controls.</p>

      <section className="mt-8">
        <h2 className="text-xl font-bold">Live floor</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tables.map((table) => (
            <PageCard key={table.id}>
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{table.label}</h3><p className="text-xs text-stone-500">{table.zone} · {table.capacity} seats</p></div><span className="rounded-full bg-stone-100 px-2 py-1 text-xs font-semibold">{tableStatusLabel(table.currentStatus)}</span></div>
              <div className="mt-4 flex flex-wrap gap-2">
                {TABLE_TRANSITIONS[table.currentStatus].map((status) => (
                  <form key={status} action={transitionStaffTable} className="flex items-center gap-2">
                    <input type="hidden" name="tableId" value={table.id} /><input type="hidden" name="status" value={status} />
                    {status === "OCCUPIED" && <input name="partySize" type="number" min={1} max={table.capacity} defaultValue={Math.min(2, table.capacity)} className="w-16 rounded-lg border border-stone-300 px-2 py-1.5 text-sm" aria-label={`Party size for ${table.label}`} />}
                    <button className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-semibold hover:bg-stone-50">{tableStatusLabel(status)}</button>
                  </form>
                ))}
              </div>
            </PageCard>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold">Queue</h2>
        <p className="mt-1 text-sm text-stone-500">{isHost ? "Hosts can mark parties called, cancelled, or no-show. Seating remains manager-only in this primitive slice." : "Floor staff can view the queue; queue resolution is Host/Manager only."}</p>
        <div className="mt-4 space-y-3">
          {queue.length === 0 && <PageCard><p className="text-sm text-stone-500">No active waiting parties.</p></PageCard>}
          {queue.map((entry) => (
            <PageCard key={entry.id}>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div><h3 className="font-semibold">{entry.partyName} · {entry.partySize}</h3><p className="text-xs text-stone-500">{entry.status} · promised {entry.promisedWaitMinutes} min</p></div>
                {isHost && <div className="flex flex-wrap gap-2">{["CALLED", "CANCELLED", "NO_SHOW"].map((status) => <form key={status} action={updateStaffQueueStatus}><input type="hidden" name="queueId" value={entry.id} /><input type="hidden" name="status" value={status} /><button className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold">{status === "CALLED" ? "Mark called" : status === "CANCELLED" ? "Cancel" : "No-show"}</button></form>)}</div>}
              </div>
            </PageCard>
          ))}
        </div>
      </section>
    </main>
  );
}
