"use client";

import {
  ArrowDown,
  ArrowUp,
  BellRing,
  CalendarDays,
  Check,
  Clock3,
  Edit3,
  Plus,
  UserRoundX,
  Zap,
  UsersRound,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useDemo } from "@/components/demo/DemoProvider";
import { Modal } from "@/components/ui/Modal";
import { minutesBetween } from "@/lib/domain/analytics";
import {
  estimateWaitForParty,
  recommendTables,
} from "@/lib/domain/operations";
import type { QueueEntry, Reservation } from "@/lib/domain/types";

const inputClass =
  "mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-800 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100";
const labelClass = "text-sm font-semibold text-stone-700";

function manilaDateKey(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function manilaDateTimeInput(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function useNow(lastUpdatedAt: string) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [lastUpdatedAt]);
  return now;
}

function QueueStatus({ status }: { status: QueueEntry["status"] }) {
  const styles: Record<QueueEntry["status"], string> = {
    WAITING: "bg-amber-50 text-amber-800 border-amber-200",
    CALLED: "bg-sky-50 text-sky-800 border-sky-200",
    SEATED: "bg-emerald-50 text-emerald-800 border-emerald-200",
    CANCELLED: "bg-stone-100 text-stone-600 border-stone-200",
    NO_SHOW: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function ReservationStatus({ status }: { status: Reservation["status"] }) {
  const styles: Record<Reservation["status"], string> = {
    PENDING_APPROVAL: "bg-amber-50 text-amber-700 border-amber-200",
    CONFIRMED: "bg-violet-50 text-violet-700 border-violet-200",
    ARRIVED: "bg-sky-50 text-sky-700 border-sky-200",
    SEATED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    COMPLETED: "bg-stone-100 text-stone-600 border-stone-200",
    CANCELLED: "bg-stone-100 text-stone-600 border-stone-200",
    NO_SHOW: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function QueueForm({
  entry,
  onSubmit,
  onCancel,
  rushMode,
  estimateWait,
}: {
  entry?: QueueEntry;
  onSubmit: (form: FormData) => void;
  onCancel: () => void;
  rushMode: boolean;
  estimateWait: (partySize: number) => number;
}) {
  const [partySize, setPartySize] = useState(entry?.partySize ?? 2);
  const suggestedWait = estimateWait(partySize);
  const [promisedWait, setPromisedWait] = useState(
    entry?.promisedWaitMinutes ?? suggestedWait,
  );

  return (
    <form action={onSubmit} className="space-y-4">
      {rushMode && !entry && (
        <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          Rush mode keeps only the essential fields open. The wait estimate
          updates for the selected party size; optional details remain below.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Party name
          <input
            autoFocus
            name="partyName"
            required
            defaultValue={entry?.partyName}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Party size
          <input
            name="partySize"
            type="number"
            min={1}
            max={30}
            required
            value={partySize}
            onChange={(event) => setPartySize(Number(event.target.value))}
            className={inputClass}
          />
        </label>
        <label className={labelClass + " sm:col-span-2"}>
          <span className="flex items-center justify-between gap-3">
            Promised wait (min)
            <button
              type="button"
              onClick={() => setPromisedWait(suggestedWait)}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
            >
              Use suggestion: {suggestedWait} min
            </button>
          </span>
          <input
            name="promisedWaitMinutes"
            type="number"
            min={0}
            max={240}
            required
            value={promisedWait}
            onChange={(event) => setPromisedWait(Number(event.target.value))}
            className={inputClass}
          />
        </label>
      </div>
      <details
        className="rounded-xl border border-stone-200 bg-stone-50"
        open={!rushMode || Boolean(entry)}
      >
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-stone-700">
          Optional contact and seating preferences
        </summary>
        <div className="space-y-4 border-t border-stone-200 p-4">
          <label className={labelClass}>
            Preferred zone
            <input
              name="preferredZone"
              defaultValue={entry?.preferredZone}
              className={inputClass}
              placeholder="Optional"
            />
          </label>
          <label className={labelClass}>
            Contact
            <input
              name="contact"
              defaultValue={entry?.contact}
              className={inputClass}
              placeholder="Optional phone or name"
            />
          </label>
          <label className={labelClass}>
            Seating notes
            <textarea
              name="notes"
              defaultValue={entry?.notes}
              className={inputClass + " min-h-20 py-2"}
              placeholder="Accessibility, high chair, seating preference…"
            />
          </label>
        </div>
      </details>
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-semibold text-stone-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="min-h-11 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white"
        >
          {entry ? "Save changes" : "Add to queue"}
        </button>
      </div>
    </form>
  );
}

function ReservationForm({
  reservation,
  onSubmit,
  onCancel,
  tables,
}: {
  reservation?: Reservation;
  onSubmit: (form: FormData) => void;
  onCancel: () => void;
  tables: Array<{ id: string; label: string; capacity: number }>;
}) {
  const initialDate = reservation
    ? manilaDateTimeInput(reservation.scheduledAt)
    : manilaDateTimeInput(new Date(Date.now() + 60 * 60_000));
  return (
    <form action={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Party name
          <input
            autoFocus
            name="partyName"
            required
            defaultValue={reservation?.partyName}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Party size
          <input
            name="partySize"
            type="number"
            min={1}
            max={30}
            required
            defaultValue={reservation?.partySize ?? 2}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Date and time
          <input
            name="scheduledAt"
            type="datetime-local"
            required
            defaultValue={initialDate}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Assigned table
          <select
            name="tableId"
            defaultValue={reservation?.tableId ?? ""}
            className={inputClass}
          >
            <option value="">Unassigned</option>
            {tables.map((table) => (
              <option key={table.id} value={table.id}>
                {table.label} · {table.capacity} seats
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={labelClass}>
        Contact
        <input
          name="contact"
          defaultValue={reservation?.contact}
          className={inputClass}
          placeholder="Optional"
        />
      </label>
      <label className={labelClass}>
        Notes
        <textarea
          name="notes"
          defaultValue={reservation?.notes}
          className={`${inputClass} min-h-20 py-2`}
        />
      </label>
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-semibold text-stone-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="min-h-11 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white"
        >
          {reservation ? "Save changes" : "Create reservation"}
        </button>
      </div>
    </form>
  );
}

export function QueueManager() {
  const demo = useDemo();
  const { state } = demo;
  const now = useNow(state.lastUpdatedAt);
  const [tab, setTab] = useState<"queue" | "reservations">("queue");
  const [rushMode, setRushMode] = useState(false);
  const [reservationDate, setReservationDate] = useState("");
  const [queueModal, setQueueModal] = useState<QueueEntry | "new" | null>(null);
  const [reservationModal, setReservationModal] = useState<
    Reservation | "new" | null
  >(null);
  const [seatTarget, setSeatTarget] = useState<{
    kind: "queue" | "reservation";
    id: string;
  } | null>(null);
  const [resolveTarget, setResolveTarget] = useState<{
    kind: "queue" | "reservation";
    id: string;
    action: "cancel" | "no-show";
  } | null>(null);
  const [toast, setToast] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const notify = useCallback((tone: "success" | "error", message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => setToast(null), 3500);
  }, []);
  const handle = (result: { ok: boolean; error?: string }, success: string) => {
    if (!result.ok) {
      notify("error", result.error ?? "That action failed.");
      return false;
    }
    notify("success", success);
    return true;
  };

  const activeQueue = state.queue.filter((entry) =>
    ["WAITING", "CALLED"].includes(entry.status),
  );
  const queueHistory = state.queue.filter(
    (entry) => !["WAITING", "CALLED"].includes(entry.status),
  );
  const reservations = [...state.reservations].sort(
    (a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt),
  );
  const visibleReservations = reservationDate
    ? reservations.filter(
        (reservation) =>
          manilaDateKey(reservation.scheduledAt) === reservationDate,
      )
    : reservations;
  const seatRecord =
    seatTarget?.kind === "queue"
      ? state.queue.find((entry) => entry.id === seatTarget.id)
      : state.reservations.find(
          (reservation) => reservation.id === seatTarget?.id,
        );
  const recommendations = seatRecord
    ? recommendTables(
        state,
        {
          partySize: seatRecord.partySize,
          preferredZone:
            "preferredZone" in seatRecord
              ? seatRecord.preferredZone
              : undefined,
        },
        now,
      )
    : [];

  const submitQueue = (form: FormData) => {
    const input = {
      partyName: String(form.get("partyName") ?? ""),
      partySize: Number(form.get("partySize")),
      promisedWaitMinutes: Number(form.get("promisedWaitMinutes")),
      preferredZone: String(form.get("preferredZone") ?? ""),
      contact: String(form.get("contact") ?? ""),
      notes: String(form.get("notes") ?? ""),
    };
    const result =
      queueModal && queueModal !== "new"
        ? demo.updateQueue(queueModal.id, input)
        : demo.addQueue(input);
    if (
      handle(
        result,
        queueModal === "new"
          ? "Party added to the queue."
          : "Queue entry updated.",
      )
    )
      setQueueModal(null);
  };

  const submitReservation = (form: FormData) => {
    const localSchedule = String(form.get("scheduledAt") ?? "");
    const scheduledAt = Date.parse(`${localSchedule}:00+08:00`);
    if (Number.isNaN(scheduledAt)) {
      notify("error", "Choose a valid reservation date and time.");
      return;
    }
    const input = {
      partyName: String(form.get("partyName") ?? ""),
      partySize: Number(form.get("partySize")),
      scheduledAt: new Date(scheduledAt).toISOString(),
      tableId: String(form.get("tableId") ?? "") || undefined,
      contact: String(form.get("contact") ?? ""),
      notes: String(form.get("notes") ?? ""),
    };
    const result =
      reservationModal && reservationModal !== "new"
        ? demo.updateReservationRecord(reservationModal.id, input)
        : demo.addReservation(input);
    if (
      handle(
        result,
        reservationModal === "new"
          ? "Reservation created."
          : "Reservation updated.",
      )
    )
      setReservationModal(null);
  };

  const confirmSeat = (tableIds: string[]) => {
    if (!seatTarget) return;
    const result =
      seatTarget.kind === "queue"
        ? demo.seatQueue(seatTarget.id, tableIds)
        : demo.seatReservationRecord(seatTarget.id, tableIds);
    if (handle(result, "Party seated and table session started."))
      setSeatTarget(null);
  };

  const confirmResolve = () => {
    if (!resolveTarget) return;
    const result =
      resolveTarget.kind === "queue"
        ? resolveTarget.action === "cancel"
          ? demo.cancelQueue(resolveTarget.id)
          : demo.noShowQueue(resolveTarget.id)
        : demo.changeReservationStatus(
            resolveTarget.id,
            resolveTarget.action === "cancel" ? "CANCELLED" : "NO_SHOW",
          );
    if (
      handle(
        result,
        resolveTarget.action === "cancel"
          ? "Record cancelled."
          : "Record marked no-show.",
      )
    )
      setResolveTarget(null);
  };

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-emerald-700">GUEST FLOW</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-950 sm:text-3xl">
            Queue and reservations
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            Manage walk-ins and upcoming bookings from the same live floor.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tab === "queue" && (
            <button
              type="button"
              aria-pressed={rushMode}
              onClick={() => setRushMode((enabled) => !enabled)}
              className={
                rushMode
                  ? "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-900"
                  : "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-600"
              }
            >
              <Zap size={17} /> Rush mode {rushMode ? "on" : "off"}
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              tab === "queue"
                ? setQueueModal("new")
                : setReservationModal("new")
            }
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900"
          >
            <Plus size={17} />{" "}
            {tab === "queue" ? "Add walk-in" : "New reservation"}
          </button>
        </div>
      </div>
      <div className="mt-6 flex gap-2 border-b border-stone-200">
        <button
          type="button"
          onClick={() => setTab("queue")}
          className={`border-b-2 px-3 pb-3 text-sm font-semibold ${tab === "queue" ? "border-emerald-700 text-emerald-800" : "border-transparent text-stone-500"}`}
        >
          Live queue{" "}
          <span className="ml-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs">
            {activeQueue.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab("reservations")}
          className={`border-b-2 px-3 pb-3 text-sm font-semibold ${tab === "reservations" ? "border-emerald-700 text-emerald-800" : "border-transparent text-stone-500"}`}
        >
          Reservations{" "}
          <span className="ml-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs">
            {reservations.length}
          </span>
        </button>
      </div>

      {tab === "queue" ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <div className="border-b border-stone-200 px-5 py-4">
              <h2 className="font-semibold text-stone-900">Waiting now</h2>
              <p className="mt-1 text-xs text-stone-500">
                Elapsed timers update automatically.
              </p>
            </div>
            {activeQueue.length ? (
              <div className="divide-y divide-stone-100">
                {activeQueue.map((entry, index) => (
                  <article key={entry.id} className="p-5">
                    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                      <div className="flex min-w-0 items-start gap-4">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-100 text-sm font-bold text-stone-600">
                          {index + 1}
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-stone-900">
                              {entry.partyName}
                            </h3>
                            <QueueStatus status={entry.status} />
                          </div>
                          <p className="mt-1 text-sm text-stone-500">
                            {entry.partySize} guests
                            {entry.preferredZone
                              ? ` · prefers ${entry.preferredZone}`
                              : ""}
                          </p>
                          <p
                            className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold ${minutesBetween(entry.joinedAt, now.toISOString()) > entry.promisedWaitMinutes ? "text-rose-700" : "text-stone-500"}`}
                          >
                            <Clock3 size={13} />{" "}
                            {minutesBetween(entry.joinedAt, now.toISOString())}{" "}
                            min elapsed · promised {entry.promisedWaitMinutes}{" "}
                            min
                          </p>
                          {entry.notes && (
                            <p className="mt-2 text-xs text-stone-500">
                              Note: {entry.notes}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handle(
                              demo.reorderQueue(entry.id, -1),
                              "Queue order updated.",
                            )
                          }
                          disabled={index === 0}
                          className="grid h-10 w-10 place-items-center rounded-lg border border-stone-200 text-stone-500 disabled:opacity-30"
                          aria-label={`Move ${entry.partyName} up`}
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handle(
                              demo.reorderQueue(entry.id, 1),
                              "Queue order updated.",
                            )
                          }
                          disabled={index === activeQueue.length - 1}
                          className="grid h-10 w-10 place-items-center rounded-lg border border-stone-200 text-stone-500 disabled:opacity-30"
                          aria-label={`Move ${entry.partyName} down`}
                        >
                          <ArrowDown size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setQueueModal(entry)}
                          className="grid h-10 w-10 place-items-center rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-50"
                          aria-label={`Edit ${entry.partyName}`}
                        >
                          <Edit3 size={16} />
                        </button>
                        {entry.status === "WAITING" && (
                          <button
                            type="button"
                            onClick={() =>
                              handle(
                                demo.callQueue(entry.id),
                                "Marked called. No SMS was sent.",
                              )
                            }
                            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-800"
                          >
                            <BellRing size={15} /> Mark called
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setSeatTarget({ kind: "queue", id: entry.id })
                          }
                          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-800 px-3 text-xs font-semibold text-white"
                        >
                          <Check size={15} /> Seat
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setResolveTarget({
                              kind: "queue",
                              id: entry.id,
                              action: "cancel",
                            })
                          }
                          className="grid h-10 w-10 place-items-center rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-700"
                          aria-label={`Cancel ${entry.partyName}`}
                        >
                          <XCircle size={17} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setResolveTarget({
                              kind: "queue",
                              id: entry.id,
                              action: "no-show",
                            })
                          }
                          className="grid h-10 w-10 place-items-center rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-700"
                          aria-label={`Mark ${entry.partyName} no-show`}
                        >
                          <UserRoundX size={17} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="grid min-h-64 place-items-center p-8 text-center">
                <div>
                  <UsersRound className="mx-auto text-stone-300" size={36} />
                  <h3 className="mt-4 font-semibold text-stone-800">
                    No parties waiting
                  </h3>
                  <p className="mt-2 text-sm text-stone-500">
                    Add a walk-in when guests arrive.
                  </p>
                </div>
              </div>
            )}
          </section>
          <aside className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="font-semibold text-stone-900">Recent outcomes</h2>
            <div className="mt-4 space-y-3">
              {queueHistory
                .slice(-6)
                .reverse()
                .map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 p-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-stone-800">
                        {entry.partyName}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        {entry.partySize} guests
                      </p>
                    </div>
                    <QueueStatus status={entry.status} />
                  </div>
                ))}
            </div>
          </aside>
        </div>
      ) : (
        <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-4 border-b border-stone-200 px-5 py-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="font-semibold text-stone-900">
                Reservation list and day view
              </h2>
              <p className="mt-1 text-xs text-stone-500">
                Asia/Manila time · conflicts are checked within 90 minutes.
              </p>
            </div>
            <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              View a day
              <input
                type="date"
                value={reservationDate}
                onChange={(event) => setReservationDate(event.target.value)}
                className="ml-2 min-h-10 rounded-lg border border-stone-300 px-3 text-sm font-normal normal-case tracking-normal text-stone-700"
              />
            </label>
          </div>
          <div className="divide-y divide-stone-100">
            {visibleReservations.map((reservation) => {
              const table = state.tables.find(
                (item) => item.id === reservation.tableId,
              );
              return (
                <article
                  key={reservation.id}
                  className="flex flex-col justify-between gap-4 p-5 lg:flex-row lg:items-center"
                >
                  <div className="flex items-start gap-4">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-50 text-violet-700">
                      <CalendarDays size={20} />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-stone-900">
                          {reservation.partyName}
                        </h3>
                        <ReservationStatus status={reservation.status} />
                      </div>
                      <p className="mt-1 text-sm text-stone-500">
                        {new Intl.DateTimeFormat("en-PH", {
                          timeZone: "Asia/Manila",
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(reservation.scheduledAt))}{" "}
                        · {reservation.partySize} guests ·{" "}
                        {table?.label ?? "Unassigned"}
                      </p>
                      {reservation.notes && (
                        <p className="mt-2 text-xs text-stone-500">
                          {reservation.notes}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["CONFIRMED", "ARRIVED"].includes(reservation.status) && (
                      <>
                        <button
                          type="button"
                          onClick={() => setReservationModal(reservation)}
                          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 px-3 text-xs font-semibold text-stone-600"
                        >
                          <Edit3 size={15} /> Edit
                        </button>
                        {reservation.status === "CONFIRMED" && (
                          <button
                            type="button"
                            onClick={() =>
                              handle(
                                demo.changeReservationStatus(
                                  reservation.id,
                                  "ARRIVED",
                                ),
                                "Party marked arrived.",
                              )
                            }
                            className="min-h-10 rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-800"
                          >
                            Mark arrived
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setSeatTarget({
                              kind: "reservation",
                              id: reservation.id,
                            })
                          }
                          className="min-h-10 rounded-lg bg-emerald-800 px-3 text-xs font-semibold text-white"
                        >
                          Seat party
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setResolveTarget({
                              kind: "reservation",
                              id: reservation.id,
                              action: "cancel",
                            })
                          }
                          className="min-h-10 rounded-lg px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setResolveTarget({
                              kind: "reservation",
                              id: reservation.id,
                              action: "no-show",
                            })
                          }
                          className="min-h-10 rounded-lg px-3 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                        >
                          No-show
                        </button>
                      </>
                    )}
                    {reservation.status === "SEATED" && (
                      <button
                        type="button"
                        onClick={() =>
                          handle(
                            demo.changeReservationStatus(
                              reservation.id,
                              "COMPLETED",
                            ),
                            "Reservation completed.",
                          )
                        }
                        className="min-h-10 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800"
                      >
                        Complete
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
            {!visibleReservations.length && (
              <div className="grid min-h-56 place-items-center p-8 text-center">
                <div>
                  <CalendarDays className="mx-auto text-stone-300" size={36} />
                  <h3 className="mt-4 font-semibold text-stone-800">
                    No reservations for this day
                  </h3>
                  <p className="mt-2 text-sm text-stone-500">
                    Clear the date filter or create a new reservation.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <Modal
        open={queueModal !== null}
        title={queueModal === "new" ? "Add a walk-in" : "Edit queue entry"}
        description="Operational contact and notes stay inside the manager workspace."
        onClose={() => setQueueModal(null)}
      >
        {queueModal && (
          <QueueForm
            entry={queueModal === "new" ? undefined : queueModal}
            onSubmit={submitQueue}
            onCancel={() => setQueueModal(null)}
            rushMode={rushMode}
            estimateWait={(partySize) =>
              estimateWaitForParty(state, partySize, now)
            }
          />
        )}
      </Modal>
      <Modal
        open={reservationModal !== null}
        title={
          reservationModal === "new" ? "New reservation" : "Edit reservation"
        }
        description="Assigning a table is optional; capacity and nearby bookings are validated."
        onClose={() => setReservationModal(null)}
      >
        {reservationModal && (
          <ReservationForm
            reservation={
              reservationModal === "new" ? undefined : reservationModal
            }
            onSubmit={submitReservation}
            onCancel={() => setReservationModal(null)}
            tables={state.tables.filter((table) => table.active)}
          />
        )}
      </Modal>
      <Modal
        open={seatTarget !== null}
        title={`Seat ${seatRecord?.partyName ?? "party"}`}
        description="Recommendations consider party size, combined same-zone tables, reservations, and current progress."
        onClose={() => setSeatTarget(null)}
      >
        {recommendations.length ? (
          <div className="space-y-3">
            {recommendations.map((recommendation, index) => {
              const tables = recommendation.tableIds
                .map((tableId) =>
                  state.tables.find((item) => item.id === tableId),
                )
                .filter(
                  (table): table is (typeof state.tables)[number] =>
                    Boolean(table),
                );
              return tables.length ? (
                <button
                  key={recommendation.tableIds.join("-")}
                  type="button"
                  onClick={() => confirmSeat(recommendation.tableIds)}
                  className="flex w-full items-center justify-between gap-4 rounded-xl border border-stone-200 p-4 text-left hover:border-emerald-300 hover:bg-emerald-50"
                >
                  <div>
                    <p className="font-semibold text-stone-900">
                      {index === 0 ? "Best match · " : ""}
                      {tables.map((table) => table.label).join(" + ")}
                      {recommendation.combined ? " · combined" : ""}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-stone-500">
                      {recommendation.reason}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-emerald-700">
                    {recommendation.capacity} seats
                  </span>
                </button>
              ) : null;
            })}
          </div>
        ) : (
          <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            No available table safely fits this party without a near-term
            conflict.
          </p>
        )}
      </Modal>
      <Modal
        open={resolveTarget !== null}
        title={
          resolveTarget?.action === "no-show"
            ? "Mark as no-show?"
            : "Cancel this record?"
        }
        description="This changes the operational outcome and removes it from the active list."
        onClose={() => setResolveTarget(null)}
      >
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setResolveTarget(null)}
            className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-semibold text-stone-700"
          >
            Keep record
          </button>
          <button
            type="button"
            onClick={confirmResolve}
            className="min-h-11 rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white"
          >
            Confirm
          </button>
        </div>
      </Modal>
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-5 right-5 z-[80]"
      >
        {toast && (
          <div
            className={`max-w-sm rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-xl ${toast.tone === "success" ? "bg-emerald-800" : "bg-rose-700"}`}
          >
            {toast.message}
          </div>
        )}
      </div>
    </div>
  );
}
