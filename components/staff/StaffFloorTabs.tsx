"use client";

import { useState, type ReactNode } from "react";

export function StaffFloorTabs({ floors }: {
  floors: Array<{ id: string; name: string; content: ReactNode }>;
}) {
  const [selectedId, setSelectedId] = useState<string>();
  const selected = floors.find((floor) => floor.id === selectedId) ?? floors[0];
  if (!selected) return null;

  return (
    <>
      <nav aria-label="Dining floors" className="mt-4 flex flex-wrap gap-2">
        {floors.map((floor) => (
          <button
            key={floor.id}
            type="button"
            aria-pressed={floor.id === selected.id}
            onClick={() => setSelectedId(floor.id)}
            className={floor.id === selected.id
              ? "min-h-11 rounded-lg bg-emerald-800 px-4 text-sm font-semibold text-white"
              : "min-h-11 rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700"}
          >
            {floor.name}
          </button>
        ))}
      </nav>
      <div className="mt-5 space-y-6">{selected.content}</div>
    </>
  );
}
