"use client";

import { useState } from "react";
import { PublicFloorMap } from "@/components/customer/PublicFloorMap";
import type { PublicFloorView } from "@/lib/customer/public-floor";

// Restaurants with several floors show one at a time, with a switch between them.
export function PublicFloorTabs({ floors }: { floors: PublicFloorView[] }) {
  const [floorId, setFloorId] = useState(floors[0]?.id);
  const current = floors.find((floor) => floor.id === floorId) ?? floors[0];
  if (!current) return null;
  return (
    <PublicFloorMap
      floor={current}
      floorSwitcher={floors.length > 1 && (
        <div role="tablist" aria-label="Floors" className="mt-4 flex flex-wrap gap-2">
          {floors.map((floor) => {
            const active = floor.id === current.id;
            return (
              <button
                key={floor.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFloorId(floor.id)}
                className={`min-h-11 rounded-full px-4 text-sm font-semibold transition ${active ? "bg-emerald-800 text-white" : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-50"}`}
              >
                {floor.name}
              </button>
            );
          })}
        </div>
      )}
    />
  );
}
