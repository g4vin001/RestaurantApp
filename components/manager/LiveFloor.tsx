"use client";

import {
  Check,
  Clock3,
  List,
  Map,
  UsersRound,
  Undo2,
  Utensils,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useDemo } from "@/components/demo/DemoProvider";
import { StatusPill } from "@/components/manager/StatusPill";
import { minutesBetween } from "@/lib/domain/analytics";
import { getActiveFloorVersion } from "@/lib/domain/floor-plan";
import { TABLE_TRANSITIONS, tableStatusLabel } from "@/lib/domain/transitions";
import type {
  DiningTable,
  FloorElement,
  TableStatus,
} from "@/lib/domain/types";

function useLiveNow(lastUpdatedAt: string) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [lastUpdatedAt]);
  return now;
}

function PublishedObject({ element }: { element: FloorElement }) {
  const styles: Record<string, string> = {
    ZONE: "border-dashed border-stone-300 bg-stone-100/50 text-stone-400",
    KITCHEN: "border-stone-300 bg-stone-200/80 text-stone-600",
    WAITING_AREA: "border-sky-200 bg-sky-50 text-sky-700",
    HOST_STAND: "border-amber-200 bg-amber-50 text-amber-700",
    DOOR: "border-stone-700 bg-stone-700 text-white",
  };
  return (
    <div
      className={`absolute flex items-center justify-center overflow-hidden rounded-lg border text-center text-[10px] font-semibold ${styles[element.type] ?? "border-stone-300 bg-white text-stone-600"}`}
      style={{
        left: `${(element.x / 1600) * 100}%`,
        top: `${(element.y / 1000) * 100}%`,
        width: `${(element.width / 1600) * 100}%`,
        height: `${(element.height / 1000) * 100}%`,
        transform: `rotate(${element.rotation}deg)`,
        zIndex: element.zIndex,
      }}
    >
      {element.label}
    </div>
  );
}

function PublishedTable({
  element,
  table,
  selected,
  onSelect,
}: {
  element: FloorElement;
  table: DiningTable;
  selected: boolean;
  onSelect: () => void;
}) {
  const colors: Record<TableStatus, string> = {
    AVAILABLE: "border-emerald-300 bg-emerald-50",
    HELD: "border-sky-300 bg-sky-50",
    RESERVED: "border-violet-300 bg-violet-50",
    OCCUPIED: "border-rose-300 bg-rose-50",
    CLEANING: "border-amber-300 bg-amber-50",
    OUT_OF_SERVICE: "border-stone-400 bg-stone-200",
  };
  const shape =
    element.shape === "ROUND"
      ? "rounded-full"
      : element.shape === "BOOTH"
        ? "rounded-2xl"
        : "rounded-xl";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`absolute grid place-items-center border-2 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${shape} ${colors[table.status]} ${selected ? "ring-3 ring-emerald-700 ring-offset-2" : ""}`}
      style={{
        left: `${(element.x / 1600) * 100}%`,
        top: `${(element.y / 1000) * 100}%`,
        width: `${(element.width / 1600) * 100}%`,
        height: `${(element.height / 1000) * 100}%`,
        transform: `rotate(${element.rotation}deg)`,
        zIndex: element.zIndex,
      }}
      aria-label={`${table.label}, ${table.capacity} seats, ${tableStatusLabel(table.status)}`}
    >
      <span>
        <strong className="block text-sm text-stone-900">{table.label}</strong>
        <span className="mt-0.5 block text-[9px] font-medium uppercase tracking-wide text-stone-600">
          {tableStatusLabel(table.status)}
        </span>
      </span>
    </button>
  );
}

function TableDetailPanel({
  table,
  now,
  events,
  onChange,
  onCorrect,
}: {
  table: DiningTable;
  now: Date;
  events: Array<{
    id: string;
    previousStatus: TableStatus;
    newStatus: TableStatus;
    occurredAt: string;
  }>;
  onChange: (
    status: TableStatus,
    partySize?: number,
  ) => { ok: boolean; error?: string };
  onCorrect: (reason: string) => { ok: boolean; error?: string };
}) {
  const [seating, setSeating] = useState(false);
  const [partySize, setPartySize] = useState(Math.min(2, table.capacity));
  const [error, setError] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");

  useEffect(() => {
    setSeating(false);
    setPartySize(Math.min(2, table.capacity));
    setError(null);
    setCorrecting(false);
    setCorrectionReason("");
  }, [table.id, table.capacity]);

  const run = (status: TableStatus) => {
    if (status === "OCCUPIED") {
      setSeating(true);
      return;
    }
    const result = onChange(status);
    if (!result.ok) setError(result.error ?? "That status change failed.");
  };

  const confirmSeating = () => {
    const result = onChange("OCCUPIED", partySize);
    if (!result.ok) {
      setError(result.error ?? "That table could not be seated.");
      return;
    }
    setSeating(false);
    setError(null);
  };

  const confirmCorrection = () => {
    const result = onCorrect(correctionReason);
    if (!result.ok) {
      setError(result.error ?? "That action could not be corrected.");
      return;
    }
    setCorrecting(false);
    setCorrectionReason("");
    setError(null);
  };

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
            Table details
          </p>
          <h2 className="mt-1 text-2xl font-bold text-stone-950">
            {table.label}
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            {table.zone} · {table.capacity} seats
          </p>
        </div>
        <StatusPill status={table.status} />
      </div>
      <div className="mt-6 rounded-xl bg-stone-50 p-4">
        <p className="text-xs font-medium text-stone-500">
          Current state duration
        </p>
        <p className="mt-1 text-2xl font-bold text-stone-900">
          {minutesBetween(table.statusChangedAt, now.toISOString())} min
        </p>
      </div>
      <div className="mt-6">
        <p className="text-sm font-semibold text-stone-900">
          Available actions
        </p>
        <div className="mt-3 grid gap-2">
          {TABLE_TRANSITIONS[table.status].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => run(status)}
              className="flex min-h-11 items-center justify-between rounded-xl border border-stone-200 px-3.5 py-2.5 text-left text-sm font-semibold text-stone-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-900"
            >
              <span>Mark {tableStatusLabel(status)}</span>
              <Check size={17} />
            </button>
          ))}
        </div>
      </div>
      {seating && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-emerald-950">
              Seat a party
            </p>
            <button
              type="button"
              onClick={() => setSeating(false)}
              className="rounded p-1 text-emerald-700"
              aria-label="Cancel seating"
            >
              <X size={16} />
            </button>
          </div>
          <label className="mt-3 block text-xs font-semibold text-emerald-900">
            Party size
            <input
              type="number"
              min={1}
              max={table.capacity}
              value={partySize}
              onChange={(event) => setPartySize(Number(event.target.value))}
              className="mt-1 min-h-10 w-full rounded-lg border border-emerald-300 bg-white px-3 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={confirmSeating}
            className="mt-3 min-h-10 w-full rounded-lg bg-emerald-800 text-sm font-semibold text-white"
          >
            Confirm seating
          </button>
        </div>
      )}
      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
          {error}
        </p>
      )}
      <div className="mt-6 border-t border-stone-100 pt-5">
        <button
          type="button"
          onClick={() => setCorrecting((value) => !value)}
          disabled={!events.length}
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-stone-200 px-3 text-sm font-semibold text-stone-600 hover:border-amber-300 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Undo2 size={16} />
          Correct last action
        </button>
        <p className="mt-2 text-xs leading-5 text-stone-500">
          Available for 15 minutes. A reason is kept in the table audit history.
        </p>
        {correcting && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <label className="text-xs font-semibold text-amber-950">
              Correction reason
              <input
                autoFocus
                value={correctionReason}
                onChange={(event) => setCorrectionReason(event.target.value)}
                placeholder="For example: tapped by mistake"
                className="mt-1 min-h-10 w-full rounded-lg border border-amber-300 bg-white px-3 text-sm text-stone-800"
              />
            </label>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setCorrecting(false)}
                className="min-h-9 flex-1 rounded-lg border border-amber-300 px-3 text-xs font-semibold text-amber-900"
              >
                Keep current
              </button>
              <button
                type="button"
                onClick={confirmCorrection}
                className="min-h-9 flex-1 rounded-lg bg-amber-800 px-3 text-xs font-semibold text-white"
              >
                Apply correction
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="mt-6 border-t border-stone-100 pt-5">
        <p className="text-sm font-semibold text-stone-900">Recent history</p>
        <div className="mt-3 space-y-3">
          {events.slice(0, 4).map((event) => (
            <div key={event.id} className="text-xs text-stone-600">
              <p>
                {tableStatusLabel(event.previousStatus)} →{" "}
                <strong>{tableStatusLabel(event.newStatus)}</strong>
              </p>
              <p className="mt-0.5 text-stone-400">
                {new Intl.DateTimeFormat("en-PH", {
                  timeZone: "Asia/Manila",
                  hour: "numeric",
                  minute: "2-digit",
                }).format(new Date(event.occurredAt))}
              </p>
            </div>
          ))}
          {!events.length && (
            <p className="text-xs text-stone-400">
              No changes in this demo session.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

export function LiveFloor() {
  const params = useSearchParams();
  const { state, transitionTable, correctTable } = useDemo();
  const [view, setView] = useState<"map" | "list">("map");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const now = useLiveNow(state.lastUpdatedAt);
  const version = useMemo(() => getActiveFloorVersion(state), [state]);
  const activeTables = state.tables.filter((table) => table.active);

  useEffect(() => {
    const requested = params.get("table");
    if (requested && activeTables.some((table) => table.id === requested))
      setSelectedId(requested);
  }, [activeTables, params]);

  const selected =
    activeTables.find((table) => table.id === selectedId) ?? null;
  const changeStatus = (status: TableStatus, partySize?: number) => {
    if (!selected) return { ok: false, error: "Select a table first." };
    const result = transitionTable(selected.id, status, partySize);
    if (result.ok)
      setAnnouncement(`${selected.label} is now ${tableStatusLabel(status)}.`);
    return result;
  };
  const correctStatus = (reason: string) => {
    if (!selected) return { ok: false, error: "Select a table first." };
    const result = correctTable(selected.id, reason);
    if (result.ok)
      setAnnouncement(`${selected.label}'s last action was corrected.`);
    return result;
  };

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-emerald-700">
            LIVE OPERATIONS
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-950 sm:text-3xl">
            Live floor
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            Published{" "}
            {version
              ? `version ${version.version} · ${version.name}`
              : "floor unavailable"}
            . Draft edits do not appear here.
          </p>
        </div>
        <div className="inline-flex self-start rounded-xl border border-stone-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setView("map")}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${view === "map" ? "bg-emerald-800 text-white" : "text-stone-600 hover:bg-stone-50"}`}
          >
            <Map size={17} /> Map
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${view === "list" ? "bg-emerald-800 text-white" : "text-stone-600 hover:bg-stone-50"}`}
          >
            <List size={17} /> List
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-h-[560px] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          {view === "map" && version ? (
            <div className="overflow-auto bg-stone-200 p-5">
              <div className="relative mx-auto aspect-[8/5] min-w-[760px] max-w-[1000px] overflow-hidden border-2 border-stone-300 bg-[#fffdf8] shadow-inner">
                {version.elements
                  .filter(
                    (element) => element.visible && element.type !== "TABLE",
                  )
                  .map((element) => (
                    <PublishedObject key={element.id} element={element} />
                  ))}
                {version.elements
                  .filter(
                    (element) =>
                      element.visible &&
                      element.type === "TABLE" &&
                      element.tableId,
                  )
                  .map((element) => {
                    const table = activeTables.find(
                      (item) => item.id === element.tableId,
                    );
                    return table ? (
                      <PublishedTable
                        key={element.id}
                        element={element}
                        table={table}
                        selected={selected?.id === table.id}
                        onSelect={() => setSelectedId(table.id)}
                      />
                    ) : null;
                  })}
              </div>
            </div>
          ) : view === "map" ? (
            <div className="grid min-h-[560px] place-items-center p-8 text-center">
              <div>
                <Map className="mx-auto text-stone-300" size={36} />
                <h2 className="mt-4 font-semibold text-stone-800">
                  No published floor
                </h2>
                <p className="mt-2 text-sm text-stone-500">
                  Publish a draft from Floor plans to begin live operations.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {activeTables.map((table) => (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => setSelectedId(table.id)}
                  className={`flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-stone-50 ${selected?.id === table.id ? "bg-emerald-50" : ""}`}
                >
                  <div>
                    <p className="font-semibold text-stone-900">
                      {table.label}{" "}
                      <span className="font-normal text-stone-400">
                        · {table.zone}
                      </span>
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-stone-500">
                      <UsersRound size={13} /> {table.capacity} seats{" "}
                      <Clock3 size={13} className="ml-2" />{" "}
                      {minutesBetween(table.statusChangedAt, now.toISOString())}{" "}
                      min
                    </p>
                  </div>
                  <StatusPill status={table.status} />
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="self-start rounded-2xl border border-stone-200 bg-white p-5 shadow-sm xl:sticky xl:top-24">
          {selected ? (
            <TableDetailPanel
              table={selected}
              now={now}
              events={state.events.filter(
                (event) => event.tableId === selected.id,
              )}
              onChange={changeStatus}
              onCorrect={correctStatus}
            />
          ) : (
            <div className="grid min-h-72 place-items-center text-center">
              <div>
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <Utensils size={22} />
                </span>
                <h2 className="mt-4 font-semibold text-stone-900">
                  Select a table
                </h2>
                <p className="mt-2 text-sm leading-6 text-stone-500">
                  Choose a table on the published map or switch to list view.
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
