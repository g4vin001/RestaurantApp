"use client";

import { useState } from "react";
import { FloorMapCanvas } from "@/components/manager/FloorMapCanvas";
import type { DemoState } from "@/lib/domain/types";

const MODE_COPY: Record<
  "assign" | "seat" | "move",
  { helper: string; maxTables: number }
> = {
  assign: {
    helper:
      "Any table can be assigned ahead of time — this only labels the reservation, it doesn't change a table's live status.",
    maxTables: 1,
  },
  seat: {
    helper:
      "Choose an available table, or a same-zone pair for a larger party. The best match is outlined in amber.",
    maxTables: 2,
  },
  move: {
    helper:
      "Choose a new available table (or same-zone pair). The current table is released the moment you confirm.",
    maxTables: 2,
  },
};

export function ReservationTablePicker({
  state,
  mode,
  partySize,
  excludeTableIds = [],
  recommendedTableIds = [],
  onConfirm,
  onCancel,
}: {
  state: DemoState;
  mode: "assign" | "seat" | "move";
  partySize: number;
  excludeTableIds?: string[];
  recommendedTableIds?: string[];
  onConfirm: (tableIds: string[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const { helper, maxTables } = MODE_COPY[mode];
  const activeTables = state.tables.filter((table) => table.active);

  const disabledTableIds =
    mode === "assign"
      ? []
      : activeTables
          .filter(
            (table) =>
              table.status !== "AVAILABLE" || excludeTableIds.includes(table.id),
          )
          .map((table) => table.id);

  const toggle = (tableId: string) => {
    if (maxTables === 1) {
      onConfirm([tableId]);
      return;
    }
    setSelected((current) => {
      if (current.includes(tableId)) return current.filter((id) => id !== tableId);
      if (current.length >= maxTables) return current;
      return [...current, tableId];
    });
  };

  const selectedCapacity = selected.reduce((sum, id) => {
    const table = activeTables.find((item) => item.id === id);
    return sum + (table?.capacity ?? 0);
  }, 0);

  return (
    <div>
      <p className="text-sm text-stone-500">{helper}</p>
      <div className="mt-3 overflow-hidden rounded-2xl border border-stone-200">
        <FloorMapCanvas
          state={state}
          activeTables={activeTables}
          selectedIds={selected}
          disabledTableIds={disabledTableIds}
          recommendedTableIds={recommendedTableIds}
          onSelectTable={toggle}
        />
      </div>
      {maxTables > 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-stone-500">
            {selected.length
              ? `${selected.length} table${selected.length > 1 ? "s" : ""} selected · ${selectedCapacity} seats for ${partySize} guests`
              : "Select one table, or two in the same zone for a larger party."}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-10 rounded-lg border border-stone-300 px-4 text-sm font-semibold text-stone-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selected.length}
              onClick={() => onConfirm(selected)}
              className="min-h-10 rounded-lg bg-emerald-800 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Confirm
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
