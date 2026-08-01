"use client";

import { Eye, EyeOff, Lock, Unlock } from "lucide-react";
import type { FloorElement } from "@/lib/domain/types";

const inputClass =
  "mt-1 min-h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-800 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100";

interface FloorInspectorProps {
  elements: FloorElement[];
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onUpdate: (id: string, values: Partial<FloorElement>) => void;
  onToggleVisible: (id: string) => void;
}

export function FloorInspector({
  elements,
  selectedIds,
  onSelect,
  onUpdate,
  onToggleVisible,
}: FloorInspectorProps) {
  const selected =
    selectedIds.length === 1
      ? elements.find((element) => element.id === selectedIds[0])
      : null;
  return (
    <aside className="w-80 shrink-0 overflow-y-auto border-l border-stone-200 bg-white">
      <section className="border-b border-stone-200 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">
          Inspector
        </p>
        {!selected && (
          <p className="mt-4 rounded-xl bg-stone-50 p-4 text-sm leading-6 text-stone-500">
            {selectedIds.length > 1
              ? `${selectedIds.length} objects selected. Use the toolbar to align or distribute them.`
              : "Select an object to edit its properties."}
          </p>
        )}
        {selected && (
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-semibold text-stone-600">
              Label
              <input
                className={inputClass}
                value={selected.label}
                onChange={(event) =>
                  onUpdate(selected.id, { label: event.target.value })
                }
              />
            </label>
            {selected.type === "TABLE" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-semibold text-stone-600">
                    Capacity
                    <input
                      type="number"
                      min={0}
                      max={30}
                      className={inputClass}
                      value={selected.capacity ?? 0}
                      onChange={(event) =>
                        onUpdate(selected.id, {
                          capacity: Number(event.target.value),
                          maxPartySize: Math.max(
                            Number(event.target.value),
                            selected.minPartySize ?? 1,
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs font-semibold text-stone-600">
                    Zone
                    <input
                      className={inputClass}
                      value={selected.zone ?? ""}
                      onChange={(event) =>
                        onUpdate(selected.id, { zone: event.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-semibold text-stone-600">
                    Min party
                    <input
                      type="number"
                      min={1}
                      className={inputClass}
                      value={selected.minPartySize ?? 1}
                      onChange={(event) =>
                        onUpdate(selected.id, {
                          minPartySize: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs font-semibold text-stone-600">
                    Max party
                    <input
                      type="number"
                      min={1}
                      className={inputClass}
                      value={selected.maxPartySize ?? selected.capacity ?? 1}
                      onChange={(event) =>
                        onUpdate(selected.id, {
                          maxPartySize: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-stone-600">
                X
                <input
                  type="number"
                  className={inputClass}
                  value={Math.round(selected.x)}
                  onChange={(event) =>
                    onUpdate(selected.id, { x: Number(event.target.value) })
                  }
                />
              </label>
              <label className="block text-xs font-semibold text-stone-600">
                Y
                <input
                  type="number"
                  className={inputClass}
                  value={Math.round(selected.y)}
                  onChange={(event) =>
                    onUpdate(selected.id, { y: Number(event.target.value) })
                  }
                />
              </label>
              <label className="block text-xs font-semibold text-stone-600">
                Width
                <input
                  type="number"
                  min={30}
                  className={inputClass}
                  value={Math.round(selected.width)}
                  onChange={(event) =>
                    onUpdate(selected.id, { width: Number(event.target.value) })
                  }
                />
              </label>
              <label className="block text-xs font-semibold text-stone-600">
                Height
                <input
                  type="number"
                  min={30}
                  className={inputClass}
                  value={Math.round(selected.height)}
                  onChange={(event) =>
                    onUpdate(selected.id, {
                      height: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
            <label className="block text-xs font-semibold text-stone-600">
              Rotation
              <div className="mt-1 flex items-center gap-3">
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={5}
                  className="min-h-10 flex-1 accent-emerald-700"
                  value={selected.rotation}
                  onChange={(event) =>
                    onUpdate(selected.id, {
                      rotation: Number(event.target.value),
                    })
                  }
                />
                <span className="w-12 text-right text-xs text-stone-500">
                  {selected.rotation}°
                </span>
              </div>
            </label>
            <label className="block text-xs font-semibold text-stone-600">
              Notes
              <textarea
                className={`${inputClass} min-h-20 py-2`}
                value={selected.notes ?? ""}
                onChange={(event) =>
                  onUpdate(selected.id, { notes: event.target.value })
                }
              />
            </label>
            <button
              type="button"
              onClick={() =>
                onUpdate(selected.id, { locked: !selected.locked })
              }
              className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-stone-300 text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              {selected.locked ? <Unlock size={16} /> : <Lock size={16} />}
              {selected.locked ? "Unlock object" : "Lock object"}
            </button>
          </div>
        )}
      </section>
      <section className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">
            Layers
          </p>
          <span className="text-xs text-stone-400">{elements.length}</span>
        </div>
        <div className="mt-3 space-y-1">
          {[...elements]
            .sort((a, b) => b.zIndex - a.zIndex)
            .map((element) => (
              <div
                key={element.id}
                className={`flex items-center rounded-lg border ${selectedIds.includes(element.id) ? "border-emerald-300 bg-emerald-50" : "border-transparent hover:bg-stone-50"}`}
              >
                <button
                  type="button"
                  onClick={() => onSelect([element.id])}
                  className="min-w-0 flex-1 px-2.5 py-2 text-left"
                >
                  <span className="block truncate text-xs font-semibold text-stone-700">
                    {element.label}
                  </span>
                  <span className="block text-[10px] uppercase tracking-wide text-stone-400">
                    {element.type.replaceAll("_", " ")}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleVisible(element.id)}
                  className="mr-1 rounded-md p-2 text-stone-400 hover:bg-white hover:text-stone-700"
                  aria-label={`${element.visible ? "Hide" : "Show"} ${element.label}`}
                >
                  {element.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
              </div>
            ))}
        </div>
      </section>
    </aside>
  );
}
