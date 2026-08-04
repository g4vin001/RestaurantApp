"use client";

import {
  Armchair,
  Columns3,
  CookingPot,
  DoorOpen,
  LayoutTemplate,
  Minus,
  PanelTop,
  RectangleHorizontal,
  Square,
  Table2,
  Toilet,
  Type,
  UsersRound,
} from "lucide-react";
import type { FloorElementType, TableShape } from "@/lib/domain/types";

interface LibraryItem {
  label: string;
  type: FloorElementType;
  shape?: TableShape;
  icon: typeof Square;
}

const items: Array<{ group: string; entries: LibraryItem[] }> = [
  {
    group: "Tables",
    entries: [
      { label: "Round table", type: "TABLE", shape: "ROUND", icon: Armchair },
      { label: "Square table", type: "TABLE", shape: "SQUARE", icon: Square },
      {
        label: "Rectangle",
        type: "TABLE",
        shape: "RECTANGLE",
        icon: RectangleHorizontal,
      },
      { label: "Booth", type: "TABLE", shape: "BOOTH", icon: Table2 },
    ],
  },
  {
    group: "Restaurant",
    entries: [
      { label: "Bar / counter", type: "BAR", icon: RectangleHorizontal },
      { label: "Host stand", type: "HOST_STAND", icon: PanelTop },
      { label: "Waiting area", type: "WAITING_AREA", icon: UsersRound },
      { label: "Kitchen", type: "KITCHEN", icon: CookingPot },
      { label: "Restroom", type: "RESTROOM", icon: Toilet },
    ],
  },
  {
    group: "Structure",
    entries: [
      { label: "Wall", type: "WALL", icon: Minus },
      { label: "Door", type: "DOOR", icon: DoorOpen },
      { label: "Column", type: "COLUMN", icon: Columns3 },
      { label: "Text label", type: "TEXT", icon: Type },
      { label: "Zone", type: "ZONE", icon: LayoutTemplate },
    ],
  },
];

export function FloorLibrary({
  onAdd,
}: {
  onAdd: (type: FloorElementType, shape?: TableShape) => void;
}) {
  return (
    <aside className="w-64 shrink-0 overflow-y-auto border-r border-stone-200 bg-white p-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">
          Object library
        </p>
        <p className="mt-1 text-xs leading-5 text-stone-500">
          Click an object to add it to the center of the floor.
        </p>
      </div>
      <div className="mt-5 space-y-6">
        {items.map((group) => (
          <section key={group.group}>
            <h2 className="mb-2 text-xs font-semibold text-stone-500">
              {group.group}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {group.entries.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={`${item.type}-${item.shape ?? item.label}`}
                    type="button"
                    onClick={() => onAdd(item.type, item.shape)}
                    className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-2 py-3 text-center text-[11px] font-semibold text-stone-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                  >
                    <Icon size={20} strokeWidth={1.8} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
