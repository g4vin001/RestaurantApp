import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleUserRound,
  Coffee,
  Contact,
  DoorOpen,
  Edit3,
  LogOut,
  MapPin,
  Plus,
  RotateCcw,
  Rows3,
  ShieldCheck,
  Sparkles,
  Timer,
  UserCheck,
  UsersRound,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { clockOut } from "@/app/work/actions";
import { StaffOperationsRefresh } from "@/components/staff/StaffOperationsRefresh";
import type { TableStatus } from "@/lib/domain/types";
import { TABLE_TRANSITIONS, tableStatusLabel } from "@/lib/domain/transitions";
import { readFlash } from "@/lib/flash";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkContext } from "@/lib/staff/access";
import { STAFF_PERMISSION_LABELS } from "@/lib/staff/permissions";
import {
  formatRestaurantDateTime,
  formatRestaurantTime,
  restaurantDateTimeInput,
  startOfRestaurantDay,
} from "@/lib/time/restaurant-time";
import {
  addStaffQueueEntry,
  addStaffReservation,
  correctStaffTable,
  editStaffQueueEntry,
  editStaffReservation,
  moveStaffReservationTable,
  reorderStaffQueueEntry,
  seatStaffQueueEntry,
  seatStaffReservation,
  transitionStaffTable,
  updateStaffQueueStatus,
  updateStaffReservationStatus,
} from "./actions";

export const dynamic = "force-dynamic";

type QueueStatus = "WAITING" | "CALLED";
type ReservationStatus =
  | "PENDING_APPROVAL"
  | "CONFIRMED"
  | "ARRIVED"
  | "SEATED";

type FloorTable = {
  id: string;
  label: string;
  capacity: number;
  zone: string;
  currentStatus: TableStatus;
  statusRevision: number;
  updatedAt: Date;
  sessions: Array<{
    partySize: number;
    seatedAt: Date;
    queueEntry: { partyName: string } | null;
    reservation: { partyName: string } | null;
  }>;
};

type QueueParty = {
  id: string;
  partyName: string;
  partySize: number;
  status: QueueStatus;
  promisedWaitMinutes: number;
  joinedAt: Date;
  revision: number;
  contact: string | null;
  notes: string | null;
  preferredZone: string | null;
};

type ShiftReservation = {
  id: string;
  partyName: string;
  partySize: number;
  scheduledAt: Date;
  status: ReservationStatus;
  assignedTableId: string | null;
  revision: number;
  contact: string | null;
  notes: string | null;
  assignedTable: { label: string } | null;
};

const inputClass =
  "min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:ring-3 focus:ring-emerald-100";
const compactInputClass =
  "min-h-10 w-full rounded-lg border border-stone-300 bg-white px-2.5 text-sm text-stone-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const primaryButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-40";
const secondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-3.5 text-xs font-bold text-stone-700 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40";
const dangerButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-xl px-3 text-xs font-bold text-rose-700 transition hover:bg-rose-50";

const tableStatusStyle: Record<TableStatus, string> = {
  AVAILABLE: "border-emerald-200 bg-emerald-50 text-emerald-800",
  HELD: "border-amber-200 bg-amber-50 text-amber-800",
  RESERVED: "border-violet-200 bg-violet-50 text-violet-800",
  OCCUPIED: "border-sky-200 bg-sky-50 text-sky-800",
  CLEANING: "border-orange-200 bg-orange-50 text-orange-800",
  OUT_OF_SERVICE: "border-rose-200 bg-rose-50 text-rose-800",
};

const reservationStatusStyle: Record<ReservationStatus, string> = {
  PENDING_APPROVAL: "border-amber-200 bg-amber-50 text-amber-800",
  CONFIRMED: "border-violet-200 bg-violet-50 text-violet-800",
  ARRIVED: "border-sky-200 bg-sky-50 text-sky-800",
  SEATED: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

function tableActionLabel(status: TableStatus, currentStatus: TableStatus) {
  if (status === "OCCUPIED") return "Seat now";
  if (status === "CLEANING") return "Clear table";
  if (status === "AVAILABLE") {
    if (currentStatus === "CLEANING") return "Mark ready";
    if (currentStatus === "OUT_OF_SERVICE") return "Reopen table";
    return "Release table";
  }
  if (status === "OUT_OF_SERVICE") return "Take offline";
  if (status === "RESERVED") return "Reserve";
  return "Hold";
}

function reservationStatusLabel(status: ReservationStatus) {
  if (status === "PENDING_APPROVAL") return "Needs approval";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function minutesSince(value: Date, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - value.getTime()) / 60_000));
}

function waitLabel(entry: QueueParty, now: Date) {
  const elapsed = minutesSince(entry.joinedAt, now);
  const delta = elapsed - entry.promisedWaitMinutes;
  if (delta > 0) return `${elapsed} min · ${delta} min over quote`;
  return `${elapsed} min · ${Math.abs(delta)} min left on quote`;
}

function reservationTimeLabel(value: Date, now: Date) {
  const difference = Math.round((value.getTime() - now.getTime()) / 60_000);
  if (Math.abs(difference) < 5) return "Due now";
  if (difference < 0) return `${Math.abs(difference)} min ago`;
  if (difference < 120) return `In ${difference} min`;
  return "Upcoming";
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  detail: string;
  tone: "emerald" | "amber" | "sky" | "violet";
}) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    sky: "bg-sky-50 text-sky-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>
          <Icon size={19} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-400">{label}</p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <strong className="text-2xl tracking-tight text-stone-950">{value}</strong>
            <span className="truncate text-xs text-stone-500">{detail}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-bold tracking-tight text-stone-950">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-500">{description}</p>
    </div>
  );
}

function EmptyState({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-stone-300 bg-white/60 p-6 text-center">
      <div>
        <Icon className="mx-auto text-stone-300" size={30} aria-hidden="true" />
        <p className="mt-3 text-sm font-bold text-stone-800">{title}</p>
        <p className="mt-1 text-xs leading-5 text-stone-500">{detail}</p>
      </div>
    </div>
  );
}

function TableCard({
  table,
  now,
  timeZone,
  canChange,
  canCorrect,
}: {
  table: FloorTable;
  now: Date;
  timeZone: string;
  canChange: boolean;
  canCorrect: boolean;
}) {
  const session = table.sessions[0];
  const guestName = session?.queueEntry?.partyName ?? session?.reservation?.partyName;
  return (
    <article className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={`h-1.5 ${table.currentStatus === "AVAILABLE" ? "bg-emerald-500" : table.currentStatus === "OCCUPIED" ? "bg-sky-500" : table.currentStatus === "CLEANING" ? "bg-orange-400" : table.currentStatus === "OUT_OF_SERVICE" ? "bg-rose-500" : "bg-violet-400"}`} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-black tracking-tight text-stone-950">{table.label}</h3>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-stone-500">
              <UsersRound size={13} aria-hidden="true" /> {table.capacity} seats
            </p>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${tableStatusStyle[table.currentStatus]}`}>
            {tableStatusLabel(table.currentStatus)}
          </span>
        </div>

        <div className="mt-4 min-h-10 rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-500">
          {session ? (
            <>
              <span className="font-bold text-stone-800">{guestName ?? `${session.partySize}-guest party`}</span>
              <span> · {session.partySize} guests · seated {minutesSince(session.seatedAt, now)} min</span>
            </>
          ) : (
            <span>Status updated {formatRestaurantTime(table.updatedAt, timeZone)} · ready for the next action</span>
          )}
        </div>

        {canChange && TABLE_TRANSITIONS[table.currentStatus].length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {TABLE_TRANSITIONS[table.currentStatus].map((status) => (
              <form key={status} action={transitionStaffTable} className="flex min-w-0 flex-1 gap-2">
                <input type="hidden" name="tableId" value={table.id} />
                <input type="hidden" name="status" value={status} />
                <input type="hidden" name="expectedRevision" value={table.statusRevision} />
                {status === "OCCUPIED" && (
                  <input
                    name="partySize"
                    type="number"
                    min={1}
                    max={table.capacity}
                    defaultValue={Math.min(2, table.capacity)}
                    className="min-h-10 w-16 rounded-xl border border-stone-300 px-2 text-sm outline-none focus:border-emerald-600"
                    aria-label={`Party size for ${table.label}`}
                  />
                )}
                <button className={status === "OCCUPIED" || status === "AVAILABLE" ? primaryButtonClass + " flex-1" : secondaryButtonClass + " flex-1"}>
                  {tableActionLabel(status, table.currentStatus)}
                </button>
              </form>
            ))}
          </div>
        )}

        {canCorrect && (
          <details className="group mt-3 rounded-xl border border-amber-200 bg-amber-50/50">
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3 text-xs font-bold text-amber-900">
              <span className="inline-flex items-center gap-1.5"><RotateCcw size={13} /> Correct latest action</span>
              <ChevronDown size={14} className="transition group-open:rotate-180" />
            </summary>
            <form action={correctStaffTable} className="space-y-2 border-t border-amber-200 p-3">
              <input type="hidden" name="tableId" value={table.id} />
              <input type="hidden" name="expectedRevision" value={table.statusRevision} />
              <input name="reason" required minLength={4} maxLength={500} placeholder="What needs correcting?" className={compactInputClass} />
              <button className="min-h-10 w-full rounded-lg bg-amber-800 px-3 text-xs font-bold text-white">Undo linked action</button>
              <p className="text-[11px] leading-4 text-amber-800">Available for the latest linked action within 15 minutes.</p>
            </form>
          </details>
        )}
      </div>
    </article>
  );
}

function QueueCard({
  entry,
  index,
  total,
  now,
  canManage,
  canSeat,
  canViewContacts,
  availableTables,
}: {
  entry: QueueParty;
  index: number;
  total: number;
  now: Date;
  canManage: boolean;
  canSeat: boolean;
  canViewContacts: boolean;
  availableTables: FloorTable[];
}) {
  const elapsed = minutesSince(entry.joinedAt, now);
  const isLate = elapsed > entry.promisedWaitMinutes;
  const suitableTables = availableTables.filter((table) => table.capacity >= entry.partySize);
  return (
    <article className={`rounded-2xl border bg-white p-4 shadow-sm ${entry.status === "CALLED" ? "border-sky-200 ring-2 ring-sky-50" : isLate ? "border-amber-200" : "border-stone-200"}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-black ${entry.status === "CALLED" ? "bg-sky-100 text-sky-800" : "bg-stone-100 text-stone-700"}`}>
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-stone-950">{entry.partyName}</h3>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${entry.status === "CALLED" ? "border-sky-200 bg-sky-50 text-sky-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              {entry.status === "CALLED" ? "Called" : "Waiting"}
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            {entry.partySize} guests · {waitLabel(entry, now)}
            {entry.preferredZone ? ` · prefers ${entry.preferredZone}` : ""}
          </p>
          {(canViewContacts && entry.contact) || entry.notes ? (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
              {canViewContacts && entry.contact && <span className="inline-flex items-center gap-1.5"><Contact size={13} /> {entry.contact}</span>}
              {entry.notes && <span className="inline-flex items-center gap-1.5"><Coffee size={13} /> {entry.notes}</span>}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
        {canManage && entry.status === "WAITING" && (
          <form action={updateStaffQueueStatus}>
            <input type="hidden" name="queueId" value={entry.id} />
            <input type="hidden" name="expectedRevision" value={entry.revision} />
            <input type="hidden" name="status" value="CALLED" />
            <button className={secondaryButtonClass}><UserCheck size={14} /> Call party</button>
          </form>
        )}
        {canSeat && suitableTables.length > 0 && (
          <form action={seatStaffQueueEntry} className="flex flex-1 gap-2 sm:flex-none">
            <input type="hidden" name="queueId" value={entry.id} />
            <input type="hidden" name="expectedRevision" value={entry.revision} />
            <select name="tableId" aria-label={`Table for ${entry.partyName}`} className={compactInputClass + " min-w-28 flex-1"}>
              {suitableTables.map((table) => <option key={table.id} value={table.id}>{table.label} · {table.capacity}</option>)}
            </select>
            <button className={primaryButtonClass}><Utensils size={14} /> Seat</button>
          </form>
        )}
        {canSeat && suitableTables.length === 0 && <p className="py-2 text-xs font-semibold text-amber-700">No available table fits this party yet.</p>}
        {canManage && (
          <>
            <form action={reorderStaffQueueEntry}>
              <input type="hidden" name="queueId" value={entry.id} />
              <input type="hidden" name="expectedRevision" value={entry.revision} />
              <input type="hidden" name="direction" value={-1} />
              <button disabled={index === 0} aria-label={`Move ${entry.partyName} up`} className="grid h-10 w-10 place-items-center rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 disabled:opacity-30"><ArrowUp size={15} /></button>
            </form>
            <form action={reorderStaffQueueEntry}>
              <input type="hidden" name="queueId" value={entry.id} />
              <input type="hidden" name="expectedRevision" value={entry.revision} />
              <input type="hidden" name="direction" value={1} />
              <button disabled={index === total - 1} aria-label={`Move ${entry.partyName} down`} className="grid h-10 w-10 place-items-center rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 disabled:opacity-30"><ArrowDown size={15} /></button>
            </form>
          </>
        )}
      </div>

      {canManage && (
        <details className="group mt-3 border-t border-stone-100 pt-3">
          <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold text-stone-500 hover:text-stone-800">
            <span className="inline-flex items-center gap-1.5"><Edit3 size={13} /> Edit or resolve</span>
            <ChevronDown size={14} className="transition group-open:rotate-180" />
          </summary>
          <form action={editStaffQueueEntry} className="mt-3 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="queueId" value={entry.id} />
            <input type="hidden" name="expectedRevision" value={entry.revision} />
            <input name="partyName" required maxLength={120} defaultValue={entry.partyName} aria-label="Party name" className={compactInputClass} />
            <input name="partySize" type="number" required min={1} max={100} defaultValue={entry.partySize} aria-label="Party size" className={compactInputClass} />
            <input name="promisedWaitMinutes" type="number" required min={0} max={240} defaultValue={entry.promisedWaitMinutes} aria-label="Promised wait" className={compactInputClass} />
            <input name="preferredZone" maxLength={120} defaultValue={entry.preferredZone ?? ""} placeholder="Preferred zone" aria-label="Preferred zone" className={compactInputClass} />
            {canViewContacts && <input name="contact" maxLength={160} defaultValue={entry.contact ?? ""} placeholder="Contact" aria-label="Contact" className={compactInputClass} />}
            <input name="notes" maxLength={2000} defaultValue={entry.notes ?? ""} placeholder="Seating notes" aria-label="Notes" className={compactInputClass + (canViewContacts ? "" : " sm:col-span-2")} />
            <button className={primaryButtonClass + " sm:col-span-2"}>Save guest details</button>
          </form>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["CANCELLED", "NO_SHOW"] as const).map((status) => (
              <form key={status} action={updateStaffQueueStatus}>
                <input type="hidden" name="queueId" value={entry.id} />
                <input type="hidden" name="expectedRevision" value={entry.revision} />
                <input type="hidden" name="status" value={status} />
                <button className={dangerButtonClass}>{status === "CANCELLED" ? "Remove from queue" : "Mark no-show"}</button>
              </form>
            ))}
          </div>
        </details>
      )}
    </article>
  );
}

function ReservationCard({
  reservation,
  now,
  timeZone,
  tables,
  availableTables,
  canManage,
  canSeat,
  canViewContacts,
}: {
  reservation: ShiftReservation;
  now: Date;
  timeZone: string;
  tables: FloorTable[];
  availableTables: FloorTable[];
  canManage: boolean;
  canSeat: boolean;
  canViewContacts: boolean;
}) {
  const suitableTables = availableTables.filter((table) => table.capacity >= reservation.partySize);
  const timeLabel = reservationTimeLabel(reservation.scheduledAt, now);
  const needsAttention = reservation.status === "PENDING_APPROVAL" || reservation.status === "ARRIVED";
  return (
    <article className={`rounded-2xl border bg-white p-4 shadow-sm ${needsAttention ? "border-amber-200" : "border-stone-200"}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><CalendarDays size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-stone-950">{reservation.partyName}</h3>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${reservationStatusStyle[reservation.status]}`}>{reservationStatusLabel(reservation.status)}</span>
          </div>
          <p className="mt-1 text-xs font-semibold text-stone-600">
            {formatRestaurantDateTime(reservation.scheduledAt, timeZone)} · {timeLabel}
          </p>
          <p className="mt-1 text-xs text-stone-500">{reservation.partySize} guests · {reservation.assignedTable?.label ?? "Table not assigned"}</p>
          {(canViewContacts && reservation.contact) || reservation.notes ? (
            <div className="mt-2 space-y-1 text-xs text-stone-600">
              {canViewContacts && reservation.contact && <p className="flex items-center gap-1.5"><Contact size={13} /> {reservation.contact}</p>}
              {reservation.notes && <p className="flex items-center gap-1.5"><Coffee size={13} /> {reservation.notes}</p>}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
        {canManage && reservation.status === "PENDING_APPROVAL" && (
          <form action={updateStaffReservationStatus}>
            <input type="hidden" name="reservationId" value={reservation.id} />
            <input type="hidden" name="expectedRevision" value={reservation.revision} />
            <input type="hidden" name="status" value="CONFIRMED" />
            <button className={primaryButtonClass}><CheckCircle2 size={14} /> Approve</button>
          </form>
        )}
        {canManage && reservation.status === "CONFIRMED" && (
          <form action={updateStaffReservationStatus}>
            <input type="hidden" name="reservationId" value={reservation.id} />
            <input type="hidden" name="expectedRevision" value={reservation.revision} />
            <input type="hidden" name="status" value="ARRIVED" />
            <button className={secondaryButtonClass}><UserCheck size={14} /> Mark arrived</button>
          </form>
        )}
        {canSeat && ["CONFIRMED", "ARRIVED"].includes(reservation.status) && suitableTables.length > 0 && (
          <form action={seatStaffReservation} className="flex flex-1 gap-2">
            <input type="hidden" name="reservationId" value={reservation.id} />
            <input type="hidden" name="expectedRevision" value={reservation.revision} />
            <select name="tableId" defaultValue={reservation.assignedTableId && suitableTables.some((table) => table.id === reservation.assignedTableId) ? reservation.assignedTableId : suitableTables[0]?.id} aria-label={`Table for ${reservation.partyName}`} className={compactInputClass + " min-w-28 flex-1"}>
              {suitableTables.map((table) => <option key={table.id} value={table.id}>{table.label} · {table.capacity}</option>)}
            </select>
            <button className={primaryButtonClass}><Utensils size={14} /> Seat</button>
          </form>
        )}
        {canSeat && ["CONFIRMED", "ARRIVED"].includes(reservation.status) && suitableTables.length === 0 && <p className="py-2 text-xs font-semibold text-amber-700">No available table fits this party yet.</p>}
        {canManage && reservation.status === "SEATED" && (
          <form action={updateStaffReservationStatus}>
            <input type="hidden" name="reservationId" value={reservation.id} />
            <input type="hidden" name="expectedRevision" value={reservation.revision} />
            <input type="hidden" name="status" value="COMPLETED" />
            <button className={primaryButtonClass}><Sparkles size={14} /> Complete</button>
          </form>
        )}
        {canSeat && reservation.status === "SEATED" && suitableTables.length > 0 && (
          <form action={moveStaffReservationTable} className="flex flex-1 gap-2">
            <input type="hidden" name="reservationId" value={reservation.id} />
            <input type="hidden" name="expectedRevision" value={reservation.revision} />
            <select name="tableId" aria-label={`New table for ${reservation.partyName}`} className={compactInputClass + " min-w-28 flex-1"}>
              {suitableTables.map((table) => <option key={table.id} value={table.id}>{table.label} · {table.capacity}</option>)}
            </select>
            <button className={secondaryButtonClass}>Move table</button>
          </form>
        )}
      </div>

      {canManage && ["PENDING_APPROVAL", "CONFIRMED", "ARRIVED"].includes(reservation.status) && (
        <details className="group mt-3 border-t border-stone-100 pt-3">
          <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold text-stone-500 hover:text-stone-800">
            <span className="inline-flex items-center gap-1.5"><Edit3 size={13} /> Edit or resolve</span>
            <ChevronDown size={14} className="transition group-open:rotate-180" />
          </summary>
          <form action={editStaffReservation} className="mt-3 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="reservationId" value={reservation.id} />
            <input type="hidden" name="expectedRevision" value={reservation.revision} />
            <input name="partyName" required maxLength={120} defaultValue={reservation.partyName} aria-label="Party name" className={compactInputClass} />
            <input name="partySize" type="number" required min={1} max={100} defaultValue={reservation.partySize} aria-label="Party size" className={compactInputClass} />
            <input name="scheduledAt" type="datetime-local" required defaultValue={restaurantDateTimeInput(reservation.scheduledAt, timeZone)} aria-label="Reservation date and time" className={compactInputClass} />
            <select name="tableId" defaultValue={reservation.assignedTableId ?? ""} aria-label="Assigned table" className={compactInputClass}>
              <option value="">No table assigned</option>
              {tables.filter((table) => table.capacity >= reservation.partySize).map((table) => <option key={table.id} value={table.id}>{table.label} · {table.capacity}</option>)}
            </select>
            {canViewContacts && <input name="contact" maxLength={160} defaultValue={reservation.contact ?? ""} placeholder="Contact" aria-label="Contact" className={compactInputClass} />}
            <input name="notes" maxLength={2000} defaultValue={reservation.notes ?? ""} placeholder="Occasion, accessibility, seating notes…" aria-label="Notes" className={compactInputClass + (canViewContacts ? "" : " sm:col-span-2")} />
            <button className={primaryButtonClass + " sm:col-span-2"}>Save reservation</button>
          </form>
          <div className="mt-2 flex flex-wrap gap-2">
            {(reservation.status === "PENDING_APPROVAL" ? (["CANCELLED"] as const) : (["CANCELLED", "NO_SHOW"] as const)).map((status) => (
              <form key={status} action={updateStaffReservationStatus}>
                <input type="hidden" name="reservationId" value={reservation.id} />
                <input type="hidden" name="expectedRevision" value={reservation.revision} />
                <input type="hidden" name="status" value={status} />
                <button className={dangerButtonClass}>{status === "CANCELLED" ? reservation.status === "PENDING_APPROVAL" ? "Reject request" : "Cancel reservation" : "Mark no-show"}</button>
              </form>
            ))}
          </div>
        </details>
      )}
    </article>
  );
}

export default async function StaffOperationsPage() {
  const context = await getCurrentWorkContext();
  if (!context) redirect("/work");

  const permissions = context.permissions;
  const canViewFloor = permissions.includes("VIEW_LIVE_FLOOR");
  const canViewQueue = permissions.includes("VIEW_QUEUE");
  const canViewContacts = permissions.includes("VIEW_CONTACT_DETAILS");
  const canChangeTables = permissions.includes("CHANGE_TABLE_STATUS");
  const canCorrect = permissions.includes("CORRECT_RECENT_ACTION");
  const canManageGuests = permissions.includes("MANAGE_QUEUE");
  const canSeat = permissions.includes("SEAT_PARTIES");
  const now = new Date();
  const reservationWindowStart = startOfRestaurantDay(now, context.restaurantTimezone);
  const reservationWindowEnd = new Date(reservationWindowStart.getTime() + 48 * 60 * 60_000);

  const needsTableData = canViewFloor || canManageGuests || canSeat;
  const [error, message, tableResult, queueResult, reservationResult] = await Promise.all([
    readFlash("error"),
    readFlash("message"),
    needsTableData
      ? prisma.diningTable.findMany({
          where: { restaurantId: context.restaurantId, active: true, archivedAt: null },
          orderBy: [{ zone: "asc" }, { label: "asc" }],
          select: {
            id: true,
            label: true,
            capacity: true,
            zone: true,
            currentStatus: true,
            statusRevision: true,
            updatedAt: true,
            sessions: {
              where: { status: "ACTIVE" },
              orderBy: { seatedAt: "desc" },
              take: 1,
              select: {
                partySize: true,
                seatedAt: true,
                queueEntry: { select: { partyName: true } },
                reservation: { select: { partyName: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    canViewQueue
      ? prisma.queueEntry.findMany({
          where: { restaurantId: context.restaurantId, status: { in: ["WAITING", "CALLED"] } },
          orderBy: [{ position: "asc" }, { joinedAt: "asc" }],
          take: 200,
          select: {
            id: true,
            partyName: true,
            partySize: true,
            status: true,
            promisedWaitMinutes: true,
            joinedAt: true,
            revision: true,
            contact: canViewContacts,
            notes: true,
            preferredZone: true,
          },
        })
      : Promise.resolve([]),
    canViewQueue
      ? prisma.reservation.findMany({
          where: {
            restaurantId: context.restaurantId,
            OR: [
              { status: { in: ["ARRIVED", "SEATED"] } },
              {
                status: { in: ["PENDING_APPROVAL", "CONFIRMED"] },
                scheduledAt: { gte: reservationWindowStart, lt: reservationWindowEnd },
              },
            ],
          },
          orderBy: [{ scheduledAt: "asc" }, { partyName: "asc" }],
          take: 200,
          select: {
            id: true,
            partyName: true,
            partySize: true,
            scheduledAt: true,
            status: true,
            assignedTableId: true,
            revision: true,
            contact: canViewContacts,
            notes: true,
            assignedTable: { select: { label: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const tables = tableResult as FloorTable[];
  const queue = queueResult.map((entry) => ({ ...entry, contact: "contact" in entry ? entry.contact : null })) as QueueParty[];
  const reservationPriority: Record<ReservationStatus, number> = { PENDING_APPROVAL: 0, ARRIVED: 1, CONFIRMED: 2, SEATED: 3 };
  const reservations = (reservationResult.map((entry) => ({ ...entry, contact: "contact" in entry ? entry.contact : null })) as ShiftReservation[]).sort(
    (left, right) => reservationPriority[left.status] - reservationPriority[right.status] || left.scheduledAt.getTime() - right.scheduledAt.getTime(),
  );
  const availableTables = tables.filter((table) => table.currentStatus === "AVAILABLE");
  const groupedTables = Map.groupBy(tables, (table) => table.zone || "Main");
  const occupiedTables = tables.filter((table) => table.currentStatus === "OCCUPIED").length;
  const availableSeats = availableTables.reduce((sum, table) => sum + table.capacity, 0);
  const waitingGuests = queue.reduce((sum, entry) => sum + entry.partySize, 0);
  const attentionReservations = reservations.filter((reservation) => {
    const difference = reservation.scheduledAt.getTime() - now.getTime();
    return reservation.status === "PENDING_APPROVAL" || reservation.status === "ARRIVED" || (difference >= -30 * 60_000 && difference <= 90 * 60_000);
  }).length;
  const defaultReservationTime = restaurantDateTimeInput(new Date(now.getTime() + 60 * 60_000), context.restaurantTimezone);

  const navigation = [
    ...(canViewFloor ? [{ href: "#floor", label: "Live floor", icon: Utensils }] : []),
    ...(canViewQueue ? [{ href: "#queue", label: "Waitlist", icon: Rows3 }, { href: "#reservations", label: "Reservations", icon: CalendarDays }] : []),
  ];

  return (
    <div className="staff-app min-h-screen bg-[#f4f4f0] text-stone-900">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-emerald-950 text-white lg:flex">
        <div className="flex h-18 items-center gap-3 border-b border-white/10 px-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-400 text-sm font-black text-emerald-950">H</span>
          <div><p className="text-lg font-bold tracking-tight">Halina</p><p className="text-[11px] text-emerald-200">Staff workspace</p></div>
        </div>
        <div className="border-b border-white/10 p-4">
          <div className="rounded-2xl bg-white/8 p-3">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-300/15 text-amber-200"><Utensils size={17} /></span>
              <div className="min-w-0"><p className="truncate text-sm font-bold">{context.restaurantName}</p><p className="mt-0.5 truncate text-xs text-emerald-200">{context.restaurantLocation}</p></div>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3" aria-label="Staff operations">
          <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/70">This shift</p>
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-white/10 hover:text-white"><Icon size={18} /> {label}</Link>
          ))}
          <Link href="/work" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-white/10 hover:text-white"><CircleUserRound size={18} /> Shift access</Link>
        </nav>
        <div className="border-t border-white/10 p-4">
          <details className="group mb-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold text-emerald-100"><span className="inline-flex items-center gap-2"><ShieldCheck size={15} /> My access</span><ChevronDown size={14} className="transition group-open:rotate-180" /></summary>
            <ul className="mt-3 space-y-2 border-t border-white/10 pt-3 text-[11px] leading-4 text-emerald-100/75">
              {permissions.map((permission) => <li key={permission} className="flex gap-2"><CheckCircle2 className="mt-0.5 shrink-0 text-emerald-300" size={12} /> {STAFF_PERMISSION_LABELS[permission]}</li>)}
            </ul>
          </details>
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-sm font-bold">{context.staffName.charAt(0).toUpperCase()}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{context.staffName}</p><p className="truncate text-[11px] text-emerald-200">{context.jobTitle} · {context.staffRoleName ?? "Staff"}</p></div>
            <form action={clockOut}><button className="grid h-9 w-9 place-items-center rounded-lg text-emerald-100 hover:bg-white/10 hover:text-white" aria-label="Clock out"><LogOut size={16} /></button></form>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
          <div className="flex min-h-18 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 lg:hidden">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-900 text-sm font-black text-white">H</span>
              <div className="min-w-0"><p className="truncate text-sm font-bold text-stone-950">{context.restaurantName}</p><p className="truncate text-xs text-stone-500">{context.staffName} · {context.staffRoleName ?? context.jobTitle}</p></div>
            </div>
            <div className="hidden lg:block"><StaffOperationsRefresh restaurantId={context.restaurantId} /></div>
            <div className="flex items-center gap-2">
              {context.restaurantEnvironment === "TEST" && <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-800">Test restaurant</span>}
              <span className={`hidden rounded-full border px-3 py-1.5 text-xs font-bold sm:inline-flex ${context.walkInAvailability === "AVAILABLE" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : context.walkInAvailability === "LIMITED" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{context.walkInAvailability === "AVAILABLE" ? "Accepting walk-ins" : context.walkInAvailability === "LIMITED" ? "Walk-ins limited" : "Walk-ins paused"}</span>
              <form action={clockOut} className="lg:hidden"><button className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-xs font-bold text-stone-700"><LogOut size={14} /> Clock out</button></form>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-stone-100 px-4 py-2 lg:hidden" aria-label="Staff workspace sections">
            {navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-bold text-stone-600 hover:bg-stone-100"><Icon size={14} /> {label}</Link>)}
          </nav>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <section className="overflow-hidden rounded-3xl bg-emerald-950 text-white shadow-xl shadow-emerald-950/10">
            <div className="relative p-5 sm:p-7">
              <div className="absolute -right-20 -top-24 h-60 w-60 rounded-full bg-emerald-400/10 blur-2xl" />
              <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Live shift workspace</p>
                  <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Good shift, {context.staffName.split(" ")[0]}.</h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-100/75">Everything below is live operational data. The controls shown are exactly the ones assigned to your role.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs sm:flex">
                  <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3"><p className="text-emerald-200">Clocked in</p><p className="mt-1 font-bold text-white">{formatRestaurantTime(context.startedAt, context.restaurantTimezone)}</p></div>
                  <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3"><p className="text-emerald-200">Session ends</p><p className="mt-1 font-bold text-white">{formatRestaurantTime(context.expiresAt, context.restaurantTimezone)}</p></div>
                </div>
              </div>
              <div className="mt-4 lg:hidden"><StaffOperationsRefresh restaurantId={context.restaurantId} inverse /></div>
            </div>
          </section>

          {error && <div role="alert" className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><DoorOpen className="mt-0.5 shrink-0" size={18} /><div><p className="font-bold">Action not saved</p><p className="mt-0.5">{error}</p></div></div>}
          {message && <div role="status" className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 shrink-0" size={18} /><div><p className="font-bold">Done</p><p className="mt-0.5">{message}</p></div></div>}

          <section aria-label="Shift summary" className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {canViewFloor && <MetricCard icon={Utensils} label="Floor" value={`${availableTables.length}/${tables.length}`} detail="tables available" tone="emerald" />}
            {canViewFloor && <MetricCard icon={UsersRound} label="Dining" value={occupiedTables} detail={occupiedTables === 1 ? "occupied table" : "occupied tables"} tone="sky" />}
            {canViewQueue && <MetricCard icon={Timer} label="Waitlist" value={queue.length} detail={`${waitingGuests} guests waiting`} tone="amber" />}
            {canViewQueue && <MetricCard icon={CalendarDays} label="Reservations" value={attentionReservations} detail="need attention soon" tone="violet" />}
          </section>

          {canViewFloor && (
            <section id="floor" className="scroll-mt-32 pt-9">
              <SectionHeading eyebrow="Floor" title="Live table status" description={`${availableSeats} seats are currently available. Status changes update the manager workspace and every authorized staff device.`} />
              <div className="mt-5 space-y-6">
                {Array.from(groupedTables.entries()).map(([zone, zoneTables]) => (
                  <div key={zone}>
                    <div className="mb-3 flex items-center gap-2 text-sm font-bold text-stone-700"><MapPin size={15} className="text-emerald-700" /> {zone}<span className="text-xs font-normal text-stone-400">{zoneTables.length} tables</span></div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{zoneTables.map((table) => <TableCard key={table.id} table={table} now={now} timeZone={context.restaurantTimezone} canChange={canChangeTables} canCorrect={canCorrect} />)}</div>
                  </div>
                ))}
                {tables.length === 0 && <EmptyState icon={Utensils} title="No published tables" detail="A manager needs to publish an active floor plan before table operations appear here." />}
              </div>
            </section>
          )}

          {canViewQueue && (
            <div className="grid gap-8 pt-10 xl:grid-cols-2">
              <section id="queue" className="scroll-mt-32">
                <SectionHeading eyebrow="Front desk" title="Waitlist" description="Oldest parties stay at the top. Calling a party changes their shared status; it does not send a text message." />
                {canManageGuests && (
                  <details className="group mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 shadow-sm" open={queue.length === 0}>
                    <summary className="flex min-h-13 cursor-pointer list-none items-center justify-between px-4 text-sm font-bold text-emerald-900"><span className="inline-flex items-center gap-2"><Plus size={16} /> Add a walk-in</span><ChevronDown size={16} className="transition group-open:rotate-180" /></summary>
                    <form action={addStaffQueueEntry} className="grid gap-3 border-t border-emerald-200 p-4 sm:grid-cols-2">
                      <label className="text-xs font-bold text-stone-600">Party name<input name="partyName" required maxLength={120} placeholder="e.g. Dela Cruz" className={inputClass + " mt-1"} /></label>
                      <label className="text-xs font-bold text-stone-600">Party size<input name="partySize" type="number" required min={1} max={100} defaultValue={2} className={inputClass + " mt-1"} /></label>
                      <label className="text-xs font-bold text-stone-600">Quoted wait (minutes)<input name="promisedWaitMinutes" type="number" required min={0} max={240} defaultValue={15} className={inputClass + " mt-1"} /></label>
                      <label className="text-xs font-bold text-stone-600">Preferred zone<input name="preferredZone" maxLength={120} placeholder="Optional" className={inputClass + " mt-1"} /></label>
                      {canViewContacts && <label className="text-xs font-bold text-stone-600">Contact<input name="contact" maxLength={160} placeholder="Phone or name" className={inputClass + " mt-1"} /></label>}
                      <label className={`text-xs font-bold text-stone-600 ${canViewContacts ? "" : "sm:col-span-2"}`}>Seating notes<input name="notes" maxLength={2000} placeholder="High chair, accessibility, occasion…" className={inputClass + " mt-1"} /></label>
                      <button className={primaryButtonClass + " sm:col-span-2 min-h-11"}><Plus size={15} /> Add to waitlist</button>
                    </form>
                  </details>
                )}
                <div className="mt-4 space-y-3">{queue.map((entry, index) => <QueueCard key={entry.id} entry={entry} index={index} total={queue.length} now={now} canManage={canManageGuests} canSeat={canSeat} canViewContacts={canViewContacts} availableTables={availableTables} />)}{queue.length === 0 && <EmptyState icon={Rows3} title="No one is waiting" detail="New walk-ins will appear here in queue order." />}</div>
              </section>

              <section id="reservations" className="scroll-mt-32">
                <SectionHeading eyebrow="Bookings" title="Today & next shift" description="Today and tomorrow in restaurant time. Approvals and arrivals rise to the top of shift attention." />
                {canManageGuests && (
                  <details className="group mt-4 rounded-2xl border border-violet-200 bg-violet-50/60 shadow-sm">
                    <summary className="flex min-h-13 cursor-pointer list-none items-center justify-between px-4 text-sm font-bold text-violet-900"><span className="inline-flex items-center gap-2"><Plus size={16} /> Create a reservation</span><ChevronDown size={16} className="transition group-open:rotate-180" /></summary>
                    <form action={addStaffReservation} className="grid gap-3 border-t border-violet-200 p-4 sm:grid-cols-2">
                      <label className="text-xs font-bold text-stone-600">Party name<input name="partyName" required maxLength={120} placeholder="Guest name" className={inputClass + " mt-1"} /></label>
                      <label className="text-xs font-bold text-stone-600">Party size<input name="partySize" type="number" required min={1} max={100} defaultValue={2} className={inputClass + " mt-1"} /></label>
                      <label className="text-xs font-bold text-stone-600">Date and time<input name="scheduledAt" type="datetime-local" required defaultValue={defaultReservationTime} className={inputClass + " mt-1"} /></label>
                      <label className="text-xs font-bold text-stone-600">Assigned table<select name="tableId" defaultValue="" className={inputClass + " mt-1"}><option value="">Assign later</option>{tables.map((table) => <option key={table.id} value={table.id}>{table.label} · {table.capacity} seats</option>)}</select></label>
                      {canViewContacts && <label className="text-xs font-bold text-stone-600">Contact<input name="contact" maxLength={160} placeholder="Phone or email" className={inputClass + " mt-1"} /></label>}
                      <label className={`text-xs font-bold text-stone-600 ${canViewContacts ? "" : "sm:col-span-2"}`}>Reservation notes<input name="notes" maxLength={2000} placeholder="Occasion, accessibility, seating notes…" className={inputClass + " mt-1"} /></label>
                      <button className={primaryButtonClass + " sm:col-span-2 min-h-11"}><CalendarDays size={15} /> Create reservation</button>
                    </form>
                  </details>
                )}
                <div className="mt-4 space-y-3">{reservations.map((reservation) => <ReservationCard key={reservation.id} reservation={reservation} now={now} timeZone={context.restaurantTimezone} tables={tables} availableTables={availableTables} canManage={canManageGuests} canSeat={canSeat} canViewContacts={canViewContacts} />)}{reservations.length === 0 && <EmptyState icon={CalendarDays} title="No active bookings in this window" detail="Confirmed reservations and new customer requests will appear here." />}</div>
              </section>
            </div>
          )}

          <footer className="mt-10 flex flex-col justify-between gap-3 border-t border-stone-200 py-6 text-xs text-stone-500 sm:flex-row sm:items-center">
            <p className="inline-flex items-center gap-2"><ShieldCheck size={14} /> Role access is assigned by your manager and enforced on every save.</p>
            <Link href="/work" className="font-bold text-emerald-800 hover:text-emerald-950">View shift access</Link>
          </footer>
        </main>
      </div>
    </div>
  );
}
