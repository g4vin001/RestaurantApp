"use client";

import type { ReactNode } from "react";
import { getActiveFloorVersion } from "@/lib/domain/floor-plan";
import { tableStatusLabel } from "@/lib/domain/transitions";
import type {
  DemoState,
  DiningTable,
  FloorElement,
  TableStatus,
} from "@/lib/domain/types";

export function PublishedObject({ element }: { element: FloorElement }) {
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

export function PublishedTable({
  element,
  table,
  selected,
  disabled = false,
  recommended = false,
  onSelect,
}: {
  element: FloorElement;
  table: DiningTable;
  selected: boolean;
  disabled?: boolean;
  recommended?: boolean;
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
  const ring = selected
    ? "ring-3 ring-emerald-700 ring-offset-2"
    : recommended
      ? "ring-2 ring-amber-400 ring-offset-1"
      : "";
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`absolute grid place-items-center border-2 text-center shadow-sm transition focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${shape} ${colors[table.status]} ${ring} ${disabled ? "cursor-not-allowed opacity-40" : "hover:-translate-y-0.5 hover:shadow-md"}`}
      style={{
        left: `${(element.x / 1600) * 100}%`,
        top: `${(element.y / 1000) * 100}%`,
        width: `${(element.width / 1600) * 100}%`,
        height: `${(element.height / 1000) * 100}%`,
        transform: `rotate(${element.rotation}deg)`,
        zIndex: element.zIndex,
      }}
      aria-label={`${table.label}, ${table.capacity} seats, ${tableStatusLabel(table.status)}${disabled ? ", not selectable" : ""}`}
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

export function FloorMapCanvas({
  state,
  activeTables,
  selectedIds = [],
  disabledTableIds = [],
  recommendedTableIds = [],
  onSelectTable,
  emptyState,
}: {
  state: DemoState;
  activeTables: DiningTable[];
  selectedIds?: string[];
  disabledTableIds?: string[];
  recommendedTableIds?: string[];
  onSelectTable: (tableId: string) => void;
  emptyState?: ReactNode;
}) {
  const version = getActiveFloorVersion(state);
  if (!version) {
    return (
      emptyState ?? (
        <p className="p-8 text-center text-sm text-stone-500">
          No published floor plan is available.
        </p>
      )
    );
  }
  return (
    <div className="overflow-auto bg-stone-200 p-5">
      <div className="relative mx-auto aspect-[8/5] min-w-[760px] max-w-[1000px] overflow-hidden border-2 border-stone-300 bg-[#fffdf8] shadow-inner">
        {version.elements
          .filter((element) => element.visible && element.type !== "TABLE")
          .map((element) => (
            <PublishedObject key={element.id} element={element} />
          ))}
        {version.elements
          .filter(
            (element) =>
              element.visible && element.type === "TABLE" && element.tableId,
          )
          .map((element) => {
            const table = activeTables.find(
              (item) => item.id === element.tableId,
            );
            if (!table) return null;
            return (
              <PublishedTable
                key={element.id}
                element={element}
                table={table}
                selected={selectedIds.includes(table.id)}
                disabled={disabledTableIds.includes(table.id)}
                recommended={recommendedTableIds.includes(table.id)}
                onSelect={() => onSelectTable(table.id)}
              />
            );
          })}
      </div>
    </div>
  );
}
