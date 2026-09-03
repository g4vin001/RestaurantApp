import Link from "next/link";
import { redirect } from "next/navigation";
import {
  addQueueEntryAction,
  seatQueueEntryAction,
  setQueueStatusAction,
  transitionTableAction,
} from "./actions";
import { clockOut } from "@/app/work/actions";
import {
  TABLE_TRANSITIONS,
  tableStatusLabel,
} from "@/lib/domain/transitions";
import { readFlash } from "@/lib/flash";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkContext } from "@/lib/staff/access";

export const dynamic = "force-dynamic";

const presetLabels = {
  MANAGER: "Operations lead",
  HOST: "Host",
  FLOOR_STAFF: "Floor staff",
} as const;

const statusClasses = {
  AVAILABLE: "bg-emerald-50 text-emerald-700",
  HELD: "bg-amber-50 text-amber-800",
  RESERVED: "bg-sky-50 text-sky-700",
  OCCUPIED: "bg-rose-50 text-rose-700",
  CLEANING: "bg-violet-50 text-violet-700",
  OUT_OF_SERVICE: "bg-stone-200 text-stone-700",
} as const;

export default async function StaffOperationsPage() {
  if (process.env.NEXT_PUBLIC_HALINA_DEMO_MODE === "true") {
    redirect("/manager");
  }

  const context = await getCurrentWorkContext();
  if (!context) redirect("/work");

  const canViewFloor = context.permissions.includes("VIEW_LIVE_FLOOR");
  const canChangeTables = context.permissions.includes("CHANGE_TABLE_STATUS");
  const canViewQueue = context.permissions.includes("VIEW_QUEUE");
  const canViewContact = context.permissions.includes("VIEW_CONTACT_DETAILS");
  const canManageQueue = context.permissions.includes("MANAGE_QUEUE");
  const canSeat = context.permissions.includes("SEAT_PARTIES");

  const restaurantPromise = prisma.restaurant.findUnique({
    where: { id: context.restaurantId },
    select: {
      id: true,
      name: true,
      timezone: true,
      lastOperationalUpdateAt: true,
    },
  });
  const tablesPromise =
    canViewFloor || canSeat
      ? prisma.diningTable.findMany({
          where: {
            restaurantId: context.restaurantId,
            active: true,
            archivedAt: null,
          },
          orderBy: { label: "asc" },
          select: {
            id: true,
            label: true,
            capacity: true,
            minPartySize: true,
            maxPartySize: true,
            zone: true,
            currentStatus: true,
          },
        })
      : Promise.resolve([]);
  const queuePromise = canViewQueue
    ? prisma.queueEntry.findMany({
        where: {
          restaurantId: context.restaurantId,
          status: { in: ["WAITING", "CALLED"] },
        },
        orderBy: { joinedAt: "asc" },
        select: {
          id: true,
          partyName: true,
          partySize: true,
          status: true,
          joinedAt: true,
          promisedWaitMinutes: true,
          contact: true,
          notes: true,
          preferredZone: true,
        },
      })
    : Promise.resolve([]);

  const [restaurant, tables, queue, message, error] = await Promise.all([
    restaurantPromise,
    tablesPromise,
    queuePromise,
    readFlash("message"),
    readFlash("error"),
  ]);
  if (!restaurant) redirect("/work");

  const availableTables = tables.filter(
    (table) => table.currentStatus === "AVAILABLE",
  );
  const clock = new Intl.DateTimeFormat("en-PH", {
    timeZone: restaurant.timezone || "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-4 border-b border-stone-200 pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Work mode</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-950 sm:text-3xl">
            {restaurant.name} Operations
          </h1>
          <p className="mt-2 text-sm text-stone-600">
            {context.staffName} · {context.jobTitle} · {presetLabels[context.permissionPreset]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/ops"
            className="inline-flex min-h-10 items-center rounded-lg border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-600"
          >
            Refresh
          </Link>
          <form action={clockOut}>
            <button className="min-h-10 rounded-lg border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-700">
              Clock out
            </button>
          </form>
        </div>
      </div>

      {(message || error) && (
        <div
          className={`mt-5 rounded-xl border px-4 py-3 text-sm font-medium ${
            error
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {error ?? message}
        </div>
      )}

      <div className="mt-5 rounded-xl bg-stone-100 px-4 py-3 text-xs leading-5 text-stone-600">
        Permissions are checked again on the server for every action. Changing your role or disabling your staff record takes effect without creating a new Halina account.
      </div>

      {canViewFloor && (
        <section className="mt-7">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-stone-400">Live floor</p>
              <h2 className="mt-1 text-xl font-bold text-stone-950">Tables</h2>
            </div>
            {restaurant.lastOperationalUpdateAt && (
              <p className="text-xs text-stone-400">
                Updated {clock.format(restaurant.lastOperationalUpdateAt)}
              </p>
            )}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tables.map((table) => (
              <article key={table.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-stone-950">{table.label}</h3>
                    <p className="mt-1 text-xs text-stone-500">
                      {table.zone} · {table.capacity} seats
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusClasses[table.currentStatus]}`}>
                    {tableStatusLabel(table.currentStatus)}
                  </span>
                </div>

                {canChangeTables && (
                  <div className="mt-4 space-y-2 border-t border-stone-100 pt-3">
                    {TABLE_TRANSITIONS[table.currentStatus].map((nextStatus) =>
                      nextStatus === "OCCUPIED" ? (
                        <form key={nextStatus} action={transitionTableAction} className="flex gap-2">
                          <input type="hidden" name="tableId" value={table.id} />
                          <input type="hidden" name="toStatus" value={nextStatus} />
                          <input
                            name="partySize"
                            type="number"
                            min={1}
                            max={table.capacity}
                            required
                            placeholder="Party"
                            aria-label={`Party size for ${table.label}`}
                            className="min-h-10 min-w-0 flex-1 rounded-lg border border-stone-300 px-2 text-sm"
                          />
                          <button className="min-h-10 rounded-lg bg-emerald-800 px-3 text-xs font-semibold text-white">
                            Occupy
                          </button>
                        </form>
                      ) : (
                        <form key={nextStatus} action={transitionTableAction}>
                          <input type="hidden" name="tableId" value={table.id} />
                          <input type="hidden" name="toStatus" value={nextStatus} />
                          <button className="min-h-10 w-full rounded-lg border border-stone-200 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50">
                            Mark {tableStatusLabel(nextStatus)}
                          </button>
                        </form>
                      ),
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {canViewQueue && (
        <section className="mt-9 border-t border-stone-200 pt-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-stone-400">Queue</p>
            <h2 className="mt-1 text-xl font-bold text-stone-950">Waiting parties</h2>
          </div>

          {canManageQueue && (
            <details className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <summary className="cursor-pointer select-none text-sm font-semibold text-emerald-800">
                + Add walk-in
              </summary>
              <form action={addQueueEntryAction} className="mt-4 grid gap-3 border-t border-stone-100 pt-4 md:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs font-semibold text-stone-600">
                  Party name
                  <input name="partyName" required maxLength={100} className="mt-1 min-h-10 w-full rounded-lg border border-stone-300 px-3 text-sm" />
                </label>
                <label className="text-xs font-semibold text-stone-600">
                  Party size
                  <input name="partySize" type="number" min={1} max={30} required className="mt-1 min-h-10 w-full rounded-lg border border-stone-300 px-3 text-sm" />
                </label>
                <label className="text-xs font-semibold text-stone-600">
                  Promised wait (min)
                  <input name="promisedWaitMinutes" type="number" min={0} max={240} defaultValue={15} required className="mt-1 min-h-10 w-full rounded-lg border border-stone-300 px-3 text-sm" />
                </label>
                <label className="text-xs font-semibold text-stone-600">
                  Preferred zone
                  <input name="preferredZone" maxLength={80} className="mt-1 min-h-10 w-full rounded-lg border border-stone-300 px-3 text-sm" />
                </label>
                {canViewContact && (
                  <label className="text-xs font-semibold text-stone-600 md:col-span-2">
                    Contact (optional)
                    <input name="contact" maxLength={160} className="mt-1 min-h-10 w-full rounded-lg border border-stone-300 px-3 text-sm" />
                  </label>
                )}
                <label className="text-xs font-semibold text-stone-600 md:col-span-2">
                  Notes (optional)
                  <input name="notes" maxLength={300} className="mt-1 min-h-10 w-full rounded-lg border border-stone-300 px-3 text-sm" />
                </label>
                <div className="flex justify-end md:col-span-2 lg:col-span-4">
                  <button className="min-h-10 rounded-lg bg-emerald-800 px-4 text-xs font-semibold text-white">
                    Add to queue
                  </button>
                </div>
              </form>
            </details>
          )}

          <div className="mt-4 space-y-3">
            {queue.length ? (
              queue.map((entry) => {
                const fittingTables = availableTables.filter(
                  (table) =>
                    entry.partySize >= table.minPartySize &&
                    entry.partySize <= table.maxPartySize &&
                    entry.partySize <= table.capacity,
                );
                return (
                  <article key={entry.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-stone-950">{entry.partyName}</h3>
                          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
                            {entry.partySize} guests
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${entry.status === "CALLED" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-800"}`}>
                            {entry.status === "CALLED" ? "Called" : "Waiting"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-stone-500">
                          Joined {clock.format(entry.joinedAt)} · promised {entry.promisedWaitMinutes} min
                          {entry.preferredZone ? ` · ${entry.preferredZone}` : ""}
                        </p>
                        {canViewContact && entry.contact && (
                          <p className="mt-1 text-xs text-stone-500">Contact: {entry.contact}</p>
                        )}
                        {entry.notes && (
                          <p className="mt-1 text-xs text-stone-500">{entry.notes}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        {canManageQueue && entry.status === "WAITING" && (
                          <form action={setQueueStatusAction}>
                            <input type="hidden" name="entryId" value={entry.id} />
                            <input type="hidden" name="status" value="CALLED" />
                            <button className="min-h-10 rounded-lg border border-sky-200 px-3 text-xs font-semibold text-sky-700 hover:bg-sky-50">
                              Mark called
                            </button>
                          </form>
                        )}
                        {canSeat && fittingTables.length > 0 && (
                          <form action={seatQueueEntryAction} className="flex items-end gap-2">
                            <input type="hidden" name="entryId" value={entry.id} />
                            <label className="text-[11px] font-semibold text-stone-500">
                              Seat at
                              <select name="tableId" required className="mt-1 min-h-10 rounded-lg border border-stone-300 bg-white px-2 text-xs text-stone-700">
                                {fittingTables.map((table) => (
                                  <option key={table.id} value={table.id}>
                                    {table.label} · {table.capacity} seats
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button className="min-h-10 rounded-lg bg-emerald-800 px-3 text-xs font-semibold text-white">
                              Seat
                            </button>
                          </form>
                        )}
                        {canManageQueue && (
                          <>
                            <form action={setQueueStatusAction}>
                              <input type="hidden" name="entryId" value={entry.id} />
                              <input type="hidden" name="status" value="CANCELLED" />
                              <button className="min-h-10 rounded-lg px-3 text-xs font-semibold text-stone-600 hover:bg-stone-100">
                                Cancel
                              </button>
                            </form>
                            <form action={setQueueStatusAction}>
                              <input type="hidden" name="entryId" value={entry.id} />
                              <input type="hidden" name="status" value="NO_SHOW" />
                              <button className="min-h-10 rounded-lg px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50">
                                No-show
                              </button>
                            </form>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-500">
                No waiting parties.
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-stone-400">
            “Mark called” changes Halina&apos;s queue status only. It does not send an SMS, email, or push message.
          </p>
        </section>
      )}

      {!canViewFloor && !canViewQueue && (
        <section className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Your staff record is active, but its current permissions do not expose any operations. Ask a manager to update your role.
        </section>
      )}
    </main>
  );
}
