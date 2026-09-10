"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { staffSeatingOptions } from "@/lib/staff/seating";
import { useStaffConnection, useStaffSeating } from "./StaffOperationsProvider";

export function StaffSeatingPicker({ partyName, partySize, preferredZone, reservationId, move = false }: {
  partyName: string; partySize: number; preferredZone?: string | null; reservationId?: string; move?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const { pending } = useFormStatus();
  const { state } = useStaffConnection();
  const seating = useStaffSeating();
  // Share the small table/booking projection once per workspace and rank only
  // an opened picker, rather than serializing every pair for every waiting party.
  const options = useMemo(() => open ? staffSeatingOptions(seating.state, { partySize, preferredZone }, new Date(seating.now), reservationId) : [], [open, seating, partySize, preferredZone, reservationId]);
  // If another device takes the selected tables, require a fresh choice.
  const selected = options.find((option) => JSON.stringify(option.tableIds) === selectedKey);
  const visibleOptions = showAll ? options : options.slice(0, 12);
  // Ranking can change during a refresh. Keep a still-valid selection visible.
  if (selected && !visibleOptions.includes(selected)) visibleOptions.push(selected);
  const selectionLost = Boolean(selectedKey && !selected);
  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="rounded-xl border border-emerald-200 bg-emerald-50/40">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-bold text-emerald-900">{move ? "Move tables" : "Seat party"}</summary>
      {open && <div className="border-t border-emerald-200 p-3">
      {!options.length ? <p className="py-2 text-sm font-semibold text-amber-800">No available table or same-zone pair fits this party without a booking conflict. Ask a manager for another seating option.</p> :
    <fieldset disabled={pending || !state.online} className="min-w-0 flex-1 space-y-2 disabled:opacity-60">
      <label className="block text-xs font-bold text-stone-600">
        {move ? "Move to" : "Seat at"}
        <select value={selected ? selectedKey : ""} onChange={(event) => setSelectedKey(event.target.value)} required aria-label={`${move ? "New tables" : "Tables"} for ${partyName}`} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-900">
          <option value="">Choose a table or pair</option>
          {visibleOptions.map((option, index) => <option key={JSON.stringify(option.tableIds)} value={JSON.stringify(option.tableIds)}>{option.label} · {option.capacity} seats · {option.zone}{index === 0 ? " · Suggested" : ""}</option>)}
        </select>
      </label>
      {!showAll && options.length > 12 && <button type="button" onClick={() => setShowAll(true)} className="min-h-11 text-xs font-bold text-emerald-800">Show all {options.length} suitable options</button>}
      {selectionLost && <p role="status" className="text-xs text-amber-800">Those tables are no longer a suitable option. Choose again.</p>}
      {selected && <div className="rounded-xl bg-stone-50 p-3 text-xs leading-5 text-stone-600">
        <p className="font-bold text-stone-900">{selected.label} · {selected.zone}</p>
        <p>{selected.capacity} seats · {selected.capacity - partySize} spare · {partySize} guests</p>
        <p>{selected.tableIds.length > 1 ? "Both tables will be occupied together. Confirm they can be joined on the floor." : "This table will be occupied."}</p>
        <p>No upcoming assigned booking conflict in the current view. Availability is checked again when you save.</p>
        {selected.tableIds.map((id) => <input key={id} type="hidden" name="tableIds" value={id} />)}
      </div>}
      <button disabled={!selected || pending || !state.online} className="min-h-11 w-full rounded-xl bg-emerald-800 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{pending ? "Saving seating…" : move ? "Confirm table move" : "Confirm seating"}</button>
    </fieldset>}
    </div>}
    </details>
  );
}
