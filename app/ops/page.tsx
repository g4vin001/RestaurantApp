import { redirect } from "next/navigation";
import { clockOut } from "@/app/work/actions";
import { PageCard } from "@/components/PageCard";
import { StaffOperationsRefresh } from "@/components/staff/StaffOperationsRefresh";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkContext } from "@/lib/staff/access";
import { TABLE_TRANSITIONS, tableStatusLabel } from "@/lib/domain/transitions";
import { readFlash } from "@/lib/flash";
import {
  addStaffQueueEntry,
  correctStaffTable,
  editStaffQueueEntry,
  reorderStaffQueueEntry,
  seatStaffQueueEntry,
  transitionStaffTable,
  updateStaffQueueStatus,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function StaffOperationsPage() {
  const context = await getCurrentWorkContext();
  if (!context) redirect("/work");

  const permissions = context.permissions;
  const canViewFloor = permissions.includes("VIEW_LIVE_FLOOR");
  const canViewQueue = permissions.includes("VIEW_QUEUE");
  const canViewContacts = permissions.includes("VIEW_CONTACT_DETAILS");
  const canChangeTables = permissions.includes("CHANGE_TABLE_STATUS");
  const canCorrect = permissions.includes("CORRECT_RECENT_ACTION");
  const canManageQueue = permissions.includes("MANAGE_QUEUE");
  const canSeat = permissions.includes("SEAT_PARTIES");
  const [error, message, tables, queueResult] = await Promise.all([
    readFlash("error"),
    readFlash("message"),
    canViewFloor ? prisma.diningTable.findMany({
      where: { restaurantId: context.restaurantId, active: true, archivedAt: null },
      orderBy: [{ zone: "asc" }, { label: "asc" }],
      select: { id: true, label: true, capacity: true, zone: true, currentStatus: true, statusRevision: true },
    }) : Promise.resolve([]),
    canViewQueue ? prisma.queueEntry.findMany({
      where: { restaurantId: context.restaurantId, status: { in: ["WAITING", "CALLED"] } },
      orderBy: [{ position: "asc" }, { joinedAt: "asc" }],
      select: { id: true, partyName: true, partySize: true, status: true, promisedWaitMinutes: true, joinedAt: true, revision: true, contact: canViewContacts, notes: true },
    }) : Promise.resolve([]),
  ]);
  const queue = queueResult.map((entry) => ({
    ...entry,
    contact: "contact" in entry ? entry.contact : null,
  }));
  const availableTables = tables.filter((table) => table.currentStatus === "AVAILABLE");

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Restricted operations</p>
          <h1 className="mt-2 text-3xl font-bold">{context.restaurantName}</h1>
          <p className="mt-2 text-sm text-stone-600">
            Clocked in as {context.staffName} · {context.jobTitle} · {context.staffRoleName ?? "Staff"}. This staff view intentionally excludes analytics, floor editing, Team, settings, and owner controls.
          </p>
          {context.restaurantEnvironment === "TEST" && <p className="mt-3 inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800">TEST restaurant</p>}
        </div>
        <form action={clockOut}>
          <button className="min-h-10 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 hover:bg-stone-50">
            Clock out
          </button>
        </form>
      </div>
      <StaffOperationsRefresh restaurantId={context.restaurantId} />
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}

      {canViewFloor && <section className="mt-8">
        <h2 className="text-xl font-bold">Live floor</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tables.map((table) => (
            <PageCard key={table.id}>
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{table.label}</h3><p className="text-xs text-stone-500">{table.zone} · {table.capacity} seats</p></div><span className="rounded-full bg-stone-100 px-2 py-1 text-xs font-semibold">{tableStatusLabel(table.currentStatus)}</span></div>
              {canChangeTables && <div className="mt-4 flex flex-wrap gap-2">
                {TABLE_TRANSITIONS[table.currentStatus].map((status) => (
                  <form key={status} action={transitionStaffTable} className="flex items-center gap-2">
                    <input type="hidden" name="tableId" value={table.id} /><input type="hidden" name="status" value={status} /><input type="hidden" name="expectedRevision" value={table.statusRevision} />
                    {status === "OCCUPIED" && <input name="partySize" type="number" min={1} max={table.capacity} defaultValue={Math.min(2, table.capacity)} className="w-16 rounded-lg border border-stone-300 px-2 py-1.5 text-sm" aria-label={`Party size for ${table.label}`} />}
                    <button className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-semibold hover:bg-stone-50">{tableStatusLabel(status)}</button>
                  </form>
                ))}
              </div>}
              {canCorrect && <details className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-2"><summary className="cursor-pointer text-xs font-semibold text-amber-900">Correct latest action</summary><form action={correctStaffTable} className="mt-2 flex flex-col gap-2"><input type="hidden" name="tableId" value={table.id} /><input type="hidden" name="expectedRevision" value={table.statusRevision} /><input name="reason" required minLength={4} maxLength={500} placeholder="Reason for correction" className="min-h-10 rounded-lg border border-amber-200 px-2 text-xs" /><button className="min-h-10 rounded-lg bg-amber-800 px-3 text-xs font-semibold text-white">Correct within 15 minutes</button></form></details>}
            </PageCard>
          ))}
        </div>
      </section>}

      {canViewQueue && <section className="mt-10">
        <h2 className="text-xl font-bold">Queue</h2>
        <p className="mt-1 text-sm text-stone-500">Your role controls whether you can call, resolve, or seat a party. Mark called changes operational status only; it does not send SMS.</p>
        {canManageQueue && <details className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4"><summary className="cursor-pointer text-sm font-semibold text-emerald-900">Add a walk-in</summary><form action={addStaffQueueEntry} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><input name="partyName" required maxLength={120} placeholder="Party name" aria-label="Party name" className="min-h-11 rounded-xl border border-stone-300 px-3" /><input name="partySize" type="number" required min={1} max={100} defaultValue={2} aria-label="Party size" className="min-h-11 rounded-xl border border-stone-300 px-3" /><input name="promisedWaitMinutes" type="number" required min={0} max={240} defaultValue={15} aria-label="Promised wait in minutes" className="min-h-11 rounded-xl border border-stone-300 px-3" />{canViewContacts && <input name="contact" maxLength={160} placeholder="Contact (optional)" aria-label="Contact" className="min-h-11 rounded-xl border border-stone-300 px-3" />}<input name="notes" maxLength={2000} placeholder="Notes (optional)" aria-label="Notes" className="min-h-11 rounded-xl border border-stone-300 px-3 sm:col-span-2 lg:col-span-3" /><button className="min-h-11 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white">Add to queue</button></form></details>}
        <div className="mt-4 space-y-3">
          {queue.length === 0 && <PageCard><p className="text-sm text-stone-500">No active waiting parties.</p></PageCard>}
          {queue.map((entry) => (
            <PageCard key={entry.id}>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div><h3 className="font-semibold">{entry.partyName} · {entry.partySize}</h3><p className="text-xs text-stone-500">{entry.status} · promised {entry.promisedWaitMinutes} min</p>{canViewContacts && entry.contact && <p className="mt-1 text-xs text-stone-500">{entry.contact}</p>}</div>
                <div className="flex flex-wrap gap-2">
                  {canManageQueue && (entry.status === "WAITING" ? ["CALLED", "CANCELLED", "NO_SHOW"] : ["CANCELLED", "NO_SHOW"]).map((status) => <form key={status} action={updateStaffQueueStatus}><input type="hidden" name="queueId" value={entry.id} /><input type="hidden" name="expectedRevision" value={entry.revision} /><input type="hidden" name="status" value={status} /><button className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold">{status === "CALLED" ? "Mark called" : status === "CANCELLED" ? "Cancel" : "No-show"}</button></form>)}
                  {canManageQueue && <><form action={reorderStaffQueueEntry}><input type="hidden" name="queueId" value={entry.id} /><input type="hidden" name="expectedRevision" value={entry.revision} /><input type="hidden" name="direction" value={-1} /><button aria-label={`Move ${entry.partyName} up`} className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold">↑</button></form><form action={reorderStaffQueueEntry}><input type="hidden" name="queueId" value={entry.id} /><input type="hidden" name="expectedRevision" value={entry.revision} /><input type="hidden" name="direction" value={1} /><button aria-label={`Move ${entry.partyName} down`} className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold">↓</button></form></>}
                  {canSeat && availableTables.some((table) => table.capacity >= entry.partySize) && <form action={seatStaffQueueEntry} className="flex gap-2"><input type="hidden" name="queueId" value={entry.id} /><input type="hidden" name="expectedRevision" value={entry.revision} /><select name="tableId" aria-label={`Table for ${entry.partyName}`} className="rounded-lg border border-stone-300 px-2 py-1.5 text-xs">{availableTables.filter((table) => table.capacity >= entry.partySize).map((table) => <option key={table.id} value={table.id}>{table.label} · {table.capacity}</option>)}</select><button className="rounded-lg bg-emerald-800 px-3 py-2 text-xs font-semibold text-white">Seat</button></form>}
                </div>
              </div>
              {canManageQueue && <details className="mt-3 rounded-lg bg-stone-50 p-3"><summary className="cursor-pointer text-xs font-semibold text-stone-700">Edit queue details</summary><form action={editStaffQueueEntry} className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><input type="hidden" name="queueId" value={entry.id} /><input type="hidden" name="expectedRevision" value={entry.revision} /><input name="partyName" required maxLength={120} defaultValue={entry.partyName} aria-label="Party name" className="min-h-10 rounded-lg border border-stone-300 px-2 text-sm" /><input name="partySize" type="number" required min={1} max={100} defaultValue={entry.partySize} aria-label="Party size" className="min-h-10 rounded-lg border border-stone-300 px-2 text-sm" /><input name="promisedWaitMinutes" type="number" required min={0} max={240} defaultValue={entry.promisedWaitMinutes} aria-label="Promised wait" className="min-h-10 rounded-lg border border-stone-300 px-2 text-sm" />{canViewContacts && <input name="contact" maxLength={160} defaultValue={entry.contact ?? ""} aria-label="Contact" className="min-h-10 rounded-lg border border-stone-300 px-2 text-sm" />}<input name="notes" maxLength={2000} defaultValue={entry.notes ?? ""} aria-label="Notes" className="min-h-10 rounded-lg border border-stone-300 px-2 text-sm sm:col-span-2 lg:col-span-3" /><button className="min-h-10 rounded-lg bg-stone-800 px-3 text-xs font-semibold text-white">Save queue entry</button></form></details>}
            </PageCard>
          ))}
        </div>
      </section>}
    </main>
  );
}
