import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageCard } from "@/components/PageCard";
import { isAdminEmail, isAdminUnlocked } from "@/lib/admin/auth";
import { readFlash } from "@/lib/flash";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  applyDataLabImport,
  revertDataLabImport,
  stageDataLabImport,
  stageManualDataLabHistory,
} from "./actions";

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function minutes(start: Date, end: Date) {
  return Math.max(0, (end.getTime() - start.getTime()) / 60_000);
}

function metric(value: number | null, suffix = "") {
  return value === null ? "Not enough data" : `${Math.round(value * 10) / 10}${suffix}`;
}

export default async function DataLabPage({
  searchParams,
}: {
  searchParams: Promise<{ restaurantId?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) notFound();
  if (!(await isAdminUnlocked(user.id))) redirect("/admin");

  const { restaurantId: requestedRestaurantId } = await searchParams;
  const [error, message, restaurants] = await Promise.all([
    readFlash("error"),
    readFlash("message"),
    prisma.restaurant.findMany({
      where: { environment: "TEST", archivedAt: null },
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const selectedId = restaurants.some((restaurant) => restaurant.id === requestedRestaurantId)
    ? requestedRestaurantId
    : restaurants[0]?.id;
  const [batches, tables] = selectedId
    ? await Promise.all([
        prisma.syntheticImportBatch.findMany({
          where: { restaurantId: selectedId },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        prisma.diningTable.findMany({
          where: { restaurantId: selectedId, archivedAt: null },
          orderBy: { label: "asc" },
          include: {
            sessions: {
              where: { completedAt: { not: null } },
              orderBy: { seatedAt: "asc" },
              include: { queueEntry: true },
            },
            assignedQueueEntries: true,
            assignedReservations: true,
          },
        }),
      ])
    : [[], []];

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm font-semibold text-emerald-700">← Admin</Link>
          <p className="mt-4 text-xs font-bold uppercase tracking-widest text-violet-700">Test restaurants only</p>
          <h1 className="mt-1 text-3xl font-bold text-stone-950">Operations Data Lab</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">Stage CSV/XLSX source history, validate it, then apply it atomically so Halina&apos;s real analytics formulas are exercised. Imports never write metric overrides or appear on public restaurant pages.</p>
        </div>
        <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-800">Permanent TEST boundary</span>
      </div>

      {error && <p className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {message && <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}

      <PageCard className="mt-7">
        <h2 className="font-semibold text-stone-900">1. Choose a TEST restaurant</h2>
        {restaurants.length ? (
          <form className="mt-3 flex gap-3">
            <select name="restaurantId" defaultValue={selectedId} className="min-h-11 flex-1 rounded-xl border border-stone-300 bg-white px-3 text-sm">
              {restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name} · /{restaurant.slug}</option>)}
            </select>
            <button className="rounded-xl border border-stone-300 px-4 text-sm font-semibold">Load</button>
          </form>
        ) : (
          <p className="mt-3 text-sm text-stone-500">Create a restaurant with Environment = Test in the Admin panel first.</p>
        )}
      </PageCard>

      {selectedId && <PageCard className="mt-5">
        <h2 className="font-semibold text-stone-900">2. Stage a spreadsheet</h2>
        <p className="mt-1 text-xs leading-5 text-stone-500">UTF-8 CSV or non-macro XLSX · max 2 MB · 100 table rows · 1,000 history rows. XLSX sheets must be named <code>tables</code> and/or <code>history</code>.</p>
        <form action={stageDataLabImport} className="mt-4 grid gap-4 sm:grid-cols-[1fr_200px_auto] sm:items-end">
          <input type="hidden" name="restaurantId" value={selectedId} />
          <label className="text-sm font-medium text-stone-700">File<input name="file" type="file" accept=".csv,.xlsx" required className="mt-1 block w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm" /></label>
          <label className="text-sm font-medium text-stone-700">CSV template<select name="csvKind" className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"><option value="tables">Tables</option><option value="history">History</option></select></label>
          <button className="min-h-11 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white">Stage and validate</button>
        </form>
      </PageCard>}

      {selectedId && tables.length > 0 && <PageCard className="mt-5">
        <details>
          <summary className="cursor-pointer font-semibold text-stone-900">Or stage one manual history row</summary>
          <p className="mt-2 text-xs leading-5 text-stone-500">Manual values follow the same validation, preview, confirmation, audit, and rollback path as spreadsheet rows. Date/time inputs are interpreted in Asia/Manila.</p>
          <form action={stageManualDataLabHistory} className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <input type="hidden" name="restaurantId" value={selectedId} />
            <label className="text-sm font-medium text-stone-700">Record ID<input name="recordId" required maxLength={100} placeholder="shift-2026-08-27-t1" className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3" /></label>
            <label className="text-sm font-medium text-stone-700">Table<select name="tableLabel" required className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3">{tables.map((table) => <option key={table.id} value={table.label}>{table.label} · capacity {table.capacity}</option>)}</select></label>
            <label className="text-sm font-medium text-stone-700">Party name<input name="partyName" required maxLength={120} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3" /></label>
            <label className="text-sm font-medium text-stone-700">Party size<input name="partySize" type="number" required min={1} max={100} defaultValue={2} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3" /></label>
            <label className="text-sm font-medium text-stone-700">Source<select name="source" className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3"><option value="DIRECT">Direct seating</option><option value="WALK_IN">Walk-in queue</option><option value="RESERVATION">Reservation</option></select></label>
            <label className="text-sm font-medium text-stone-700">Outcome<select name="outcome" className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3"><option value="SEATED">Seated</option><option value="CANCELLED">Cancelled</option><option value="NO_SHOW">No-show</option></select></label>
            <label className="text-sm font-medium text-stone-700">Joined at <span className="text-xs font-normal text-stone-400">(walk-in)</span><input name="joinedAt" type="datetime-local" className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3" /></label>
            <label className="text-sm font-medium text-stone-700">Promised wait <span className="text-xs font-normal text-stone-400">(minutes)</span><input name="promisedWaitMinutes" type="number" min={0} max={240} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3" /></label>
            <label className="text-sm font-medium text-stone-700">Scheduled at <span className="text-xs font-normal text-stone-400">(reservation)</span><input name="scheduledAt" type="datetime-local" className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3" /></label>
            <label className="text-sm font-medium text-stone-700">Seated at<input name="seatedAt" type="datetime-local" className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3" /></label>
            <label className="text-sm font-medium text-stone-700">Cleared at<input name="clearedAt" type="datetime-local" className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3" /></label>
            <label className="text-sm font-medium text-stone-700">Available at<input name="availableAt" type="datetime-local" className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-3" /></label>
            <div className="md:col-span-2 xl:col-span-4"><button className="min-h-11 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white">Stage manual row for review</button></div>
          </form>
        </details>
      </PageCard>}

      {selectedId && <section className="mt-7">
        <h2 className="text-xl font-bold text-stone-950">Staged imports</h2>
        <div className="mt-4 space-y-4">
          {!batches.length && <PageCard><p className="text-sm text-stone-500">No import batches for this restaurant.</p></PageCard>}
          {batches.map((batch) => {
            const validation = batch.validationResults as { errors?: string[]; warnings?: string[] };
            const rows = batch.normalizedRows as { tables?: unknown[]; history?: unknown[] };
            return <PageCard key={batch.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-semibold text-stone-900">{batch.originalFilename}</p><p className="mt-1 text-xs text-stone-500">{batch.sourceType} · {batch.rowCount} rows · checksum {batch.checksum.slice(0, 12)}…</p></div>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-700">{batch.status}</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-stone-50 p-3 text-sm">Tables: <strong>{rows.tables?.length ?? 0}</strong></div><div className="rounded-xl bg-stone-50 p-3 text-sm">History: <strong>{rows.history?.length ?? 0}</strong></div><div className="rounded-xl bg-stone-50 p-3 text-sm">Warnings: <strong>{validation.warnings?.length ?? 0}</strong></div></div>
              {Boolean(validation.errors?.length) && <ul className="mt-4 list-disc space-y-1 rounded-xl bg-rose-50 p-4 pl-8 text-xs text-rose-700">{validation.errors?.slice(0, 20).map((item) => <li key={item}>{item}</li>)}</ul>}
              <details className="mt-4 rounded-xl border border-stone-200"><summary className="cursor-pointer p-3 text-sm font-semibold">Preview normalized rows</summary><pre className="max-h-72 overflow-auto border-t border-stone-200 p-3 text-xs">{JSON.stringify({ tables: rows.tables?.slice(0, 10), history: rows.history?.slice(0, 10) }, null, 2)}</pre></details>
              <div className="mt-4 flex gap-3">
                {batch.status === "STAGED" && !validation.errors?.length && <form action={applyDataLabImport}><input type="hidden" name="batchId" value={batch.id} /><button className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white">Confirm atomic apply</button></form>}
                {batch.status === "APPLIED" && <form action={revertDataLabImport}><input type="hidden" name="batchId" value={batch.id} /><button className="rounded-xl border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-800">Revert synthetic rows</button></form>}
              </div>
            </PageCard>;
          })}
        </div>
      </section>}

      {selectedId && <section className="mt-9">
        <h2 className="text-xl font-bold text-stone-950">Derived per-table statistics</h2>
        <p className="mt-1 text-sm text-stone-500">Calculated from sessions, queue, and reservation source rows. No revenue is invented.</p>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-stone-200 bg-white">
          <table className="min-w-[1100px] w-full text-left text-xs">
            <thead className="bg-stone-50 text-stone-600"><tr>{["Table", "Turns", "Occupancy", "Seat use", "Avg / median dining", "Cleaning", "Idle", "Queue wait", "Promise error", "Abandon / no-show", "Busiest hour"].map((heading) => <th key={heading} className="px-3 py-3 font-semibold">{heading}</th>)}</tr></thead>
            <tbody className="divide-y divide-stone-100">
              {tables.map((table) => {
                const completed = table.sessions.filter((session) => session.clearedAt && session.availableAt);
                const dining = completed.map((session) => minutes(session.seatedAt, session.clearedAt as Date));
                const cleaning = completed.map((session) => minutes(session.clearedAt as Date, session.availableAt as Date));
                const ordered = [...completed].sort((left, right) => left.seatedAt.getTime() - right.seatedAt.getTime());
                const idle = ordered.slice(1).map((session, index) => minutes(ordered[index].availableAt as Date, session.seatedAt));
                const start = ordered[0]?.seatedAt;
                const end = ordered.at(-1)?.availableAt;
                const occupancy = start && end && end > start ? dining.reduce((sum, value) => sum + value, 0) / minutes(start, end) * 100 : null;
                const seatUse = completed.length ? completed.reduce((sum, session) => sum + session.partySize / table.capacity, 0) / completed.length * 100 : null;
                const waits = completed.flatMap((session) => session.queueEntry ? [minutes(session.queueEntry.joinedAt, session.seatedAt)] : []);
                const promiseErrors = completed.flatMap((session) => session.queueEntry ? [Math.abs(minutes(session.queueEntry.joinedAt, session.seatedAt) - session.queueEntry.promisedWaitMinutes)] : []);
                const outcomes = [...table.assignedQueueEntries, ...table.assignedReservations];
                const abandoned = outcomes.length ? outcomes.filter((record) => record.status === "CANCELLED" || record.status === "NO_SHOW").length / outcomes.length * 100 : null;
                const hourCounts = new Map<number, number>();
                completed.forEach((session) => { const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "2-digit", hourCycle: "h23" }).format(session.seatedAt)); hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1); });
                const busiest = [...hourCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
                return <tr key={table.id}><td className="px-3 py-3 font-semibold">{table.label}</td><td className="px-3 py-3">{completed.length}</td><td className="px-3 py-3">{metric(occupancy, "%")}</td><td className="px-3 py-3">{metric(seatUse, "%")}</td><td className="px-3 py-3">{metric(average(dining), " min")} / {metric(median(dining), " min")}</td><td className="px-3 py-3">{metric(average(cleaning), " min")}</td><td className="px-3 py-3">{metric(average(idle), " min")}</td><td className="px-3 py-3">{metric(average(waits), " min")}</td><td className="px-3 py-3">{metric(average(promiseErrors), " min")}</td><td className="px-3 py-3">{metric(abandoned, "%")}</td><td className="px-3 py-3">{busiest === undefined ? "Not enough data" : `${String(busiest).padStart(2, "0")}:00`}</td></tr>;
              })}
              {!tables.length && <tr><td colSpan={11} className="px-4 py-10 text-center text-stone-500">No table data yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>}
    </main>
  );
}
