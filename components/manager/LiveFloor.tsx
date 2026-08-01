"use client";

import { Check, Clock3, List, Map, UsersRound, Utensils } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useDemo } from "@/components/demo/DemoProvider";
import { StatusPill } from "@/components/manager/StatusPill";
import { minutesBetween } from "@/lib/domain/analytics";
import { TABLE_TRANSITIONS, tableStatusLabel } from "@/lib/domain/transitions";
import type { TableStatus } from "@/lib/domain/types";

export function LiveFloor() {
  const params = useSearchParams();
  const { state, transitionTable } = useDemo();
  const [view, setView] = useState<"map" | "list">("map");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const now = new Date();

  useEffect(() => {
    const requested = params.get("table");
    if (requested && state.tables.some((table) => table.id === requested)) setSelectedId(requested);
  }, [params, state.tables]);

  const selected = state.tables.find((table) => table.id === selectedId) ?? null;
  const changeStatus = (status: TableStatus) => {
    if (!selected || !transitionTable(selected.id, status)) return;
    setAnnouncement(`${selected.label} is now ${tableStatusLabel(status)}.`);
  };

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <p className="sr-only" aria-live="polite">{announcement}</p>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-sm font-semibold text-emerald-700">LIVE OPERATIONS</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-950 sm:text-3xl">Live floor</h1><p className="mt-2 text-sm text-stone-500">Select a table to update its operational state.</p></div>
        <div className="inline-flex self-start rounded-xl border border-stone-200 bg-white p-1">
          <button type="button" onClick={() => setView("map")} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${view === "map" ? "bg-emerald-800 text-white" : "text-stone-600 hover:bg-stone-50"}`}><Map size={17} /> Map</button>
          <button type="button" onClick={() => setView("list")} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${view === "list" ? "bg-emerald-800 text-white" : "text-stone-600 hover:bg-stone-50"}`}><List size={17} /> List</button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-h-[560px] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          {view === "map" ? (
            <div className="relative aspect-[8/5] min-h-[560px] overflow-auto bg-[linear-gradient(to_right,#e7e5e4_1px,transparent_1px),linear-gradient(to_bottom,#e7e5e4_1px,transparent_1px)] bg-[size:24px_24px] p-5">
              <div className="relative mx-auto h-[500px] min-w-[760px] max-w-[900px] rounded-2xl border-2 border-stone-300 bg-stone-50/90 shadow-inner">
                <div className="absolute left-1/2 top-0 -translate-x-1/2 rounded-b-lg bg-stone-800 px-5 py-1.5 text-xs font-semibold text-white">Entrance</div>
                {state.tables.map((table) => {
                  const isSelected = selected?.id === table.id;
                  const colors: Record<TableStatus, string> = { AVAILABLE: "border-emerald-300 bg-emerald-50", HELD: "border-sky-300 bg-sky-50", RESERVED: "border-violet-300 bg-violet-50", OCCUPIED: "border-rose-300 bg-rose-50", CLEANING: "border-amber-300 bg-amber-50", OUT_OF_SERVICE: "border-stone-400 bg-stone-200" };
                  return <button key={table.id} type="button" onClick={() => setSelectedId(table.id)} className={`absolute grid place-items-center border-2 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${colors[table.status]} ${table.shape === "ROUND" ? "rounded-full" : table.shape === "BOOTH" ? "rounded-2xl" : "rounded-xl"} ${isSelected ? "ring-3 ring-emerald-700 ring-offset-2" : ""}`} style={{ left: `${(table.x / 1200) * 100}%`, top: `${(table.y / 900) * 100}%`, width: table.width * 0.58, height: table.height * 0.58, transform: `rotate(${table.rotation}deg)` }} aria-label={`${table.label}, ${table.capacity} seats, ${tableStatusLabel(table.status)}`}><span><strong className="block text-sm text-stone-900">{table.label}</strong><span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-stone-600">{tableStatusLabel(table.status)}</span></span></button>;
                })}
              </div>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {state.tables.map((table) => <button key={table.id} type="button" onClick={() => setSelectedId(table.id)} className={`flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-stone-50 ${selected?.id === table.id ? "bg-emerald-50" : ""}`}><div><p className="font-semibold text-stone-900">{table.label} <span className="font-normal text-stone-400">· {table.zone}</span></p><p className="mt-1 flex items-center gap-1.5 text-xs text-stone-500"><UsersRound size={13} /> {table.capacity} seats <Clock3 size={13} className="ml-2" /> {minutesBetween(table.statusChangedAt, now.toISOString())} min</p></div><StatusPill status={table.status} /></button>)}
            </div>
          )}
        </section>

        <aside className="self-start rounded-2xl border border-stone-200 bg-white p-5 shadow-sm xl:sticky xl:top-24">
          {selected ? <><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Table details</p><h2 className="mt-1 text-2xl font-bold text-stone-950">{selected.label}</h2><p className="mt-1 text-sm text-stone-500">{selected.zone} · {selected.capacity} seats</p></div><StatusPill status={selected.status} /></div><div className="mt-6 rounded-xl bg-stone-50 p-4"><p className="text-xs font-medium text-stone-500">Current state duration</p><p className="mt-1 text-2xl font-bold text-stone-900">{minutesBetween(selected.statusChangedAt, now.toISOString())} min</p></div><div className="mt-6"><p className="text-sm font-semibold text-stone-900">Available actions</p><div className="mt-3 grid gap-2">{TABLE_TRANSITIONS[selected.status].map((status) => <button key={status} type="button" onClick={() => changeStatus(status)} className="flex min-h-11 items-center justify-between rounded-xl border border-stone-200 px-3.5 py-2.5 text-left text-sm font-semibold text-stone-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-900"><span>Mark {tableStatusLabel(status)}</span><Check size={17} /></button>)}</div></div><div className="mt-6 border-t border-stone-100 pt-5"><p className="text-sm font-semibold text-stone-900">Recent history</p><div className="mt-3 space-y-3">{state.events.filter((event) => event.tableId === selected.id).slice(0, 4).map((event) => <div key={event.id} className="text-xs text-stone-600"><p>{tableStatusLabel(event.previousStatus)} → <strong>{tableStatusLabel(event.newStatus)}</strong></p><p className="mt-0.5 text-stone-400">{new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(new Date(event.occurredAt))}</p></div>)}{!state.events.some((event) => event.tableId === selected.id) && <p className="text-xs text-stone-400">No changes in this demo session.</p>}</div></div></> : <div className="grid min-h-72 place-items-center text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Utensils size={22} /></span><h2 className="mt-4 font-semibold text-stone-900">Select a table</h2><p className="mt-2 text-sm leading-6 text-stone-500">Choose a table on the map or switch to list view to inspect and update it.</p></div></div>}
        </aside>
      </div>
    </div>
  );
}
