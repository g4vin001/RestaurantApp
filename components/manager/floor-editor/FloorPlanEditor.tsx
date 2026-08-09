"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Layers3,
  Plus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDemo } from "@/components/demo/DemoProvider";
import { EditorToolbar } from "@/components/manager/floor-editor/EditorToolbar";
import { FloorCanvas } from "@/components/manager/floor-editor/FloorCanvas";
import { FloorInspector } from "@/components/manager/floor-editor/FloorInspector";
import { FloorLibrary } from "@/components/manager/floor-editor/FloorLibrary";
import { Modal } from "@/components/ui/Modal";
import {
  alignElements,
  commitEditorHistory,
  createEditorHistory,
  createFloorElement,
  distributeElements,
  duplicateElements,
  moveSelected,
  redoEditorHistory,
  reorderElement,
  selectElement,
  undoEditorHistory,
} from "@/lib/domain/editor";
import { validateFloor } from "@/lib/domain/floor-plan";
import type {
  FloorElement,
  FloorElementType,
  TableShape,
} from "@/lib/domain/types";

function PublishedHistory({
  planId,
  versions,
  onRestore,
}: {
  planId: string;
  versions: Array<{
    id: string;
    version: number;
    name: string;
    publishedAt: string;
    publishedBy: string;
  }>;
  onRestore: (planId: string, versionId: string) => void;
}) {
  return (
    <section className="border-t border-stone-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <Clock3 size={15} className="text-stone-400" />
        <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">
          Version history
        </h2>
      </div>
      <div className="mt-3 space-y-2">
        {[...versions].reverse().map((version) => (
          <div
            key={version.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 p-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-stone-700">
                Version {version.version} · {version.name}
              </p>
              <p className="mt-0.5 text-[10px] text-stone-400">
                {new Intl.DateTimeFormat("en-PH", {
                  timeZone: "Asia/Manila",
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(version.publishedAt))}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onRestore(planId, version.id)}
              className="rounded-md px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              Restore
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function FloorPlanEditor() {
  const { state, saveFloor, publishFloor, restoreFloor, createFloor } =
    useDemo();
  const [selectedPlanId, setSelectedPlanId] = useState(state.activeFloorPlanId);
  const plan =
    state.floorPlans.find((item) => item.id === selectedPlanId) ??
    state.floorPlans[0];
  const [history, setHistory] = useState(() =>
    createEditorHistory(plan.draft.elements),
  );
  const [planName, setPlanName] = useState(plan.name);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(0.55);
  const [offset, setOffset] = useState({ x: 50, y: 48 });
  const [gridVisible, setGridVisible] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [panMode, setPanMode] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newFloorOpen, setNewFloorOpen] = useState(false);
  const [newFloorName, setNewFloorName] = useState("");
  const [toast, setToast] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const previewOrigin = useRef<FloorElement[] | null>(null);

  const elements = history.present;
  const issues = useMemo(
    () =>
      validateFloor(
        elements,
        plan.draft.logicalWidth,
        plan.draft.logicalHeight,
      ),
    [elements, plan.draft.logicalHeight, plan.draft.logicalWidth],
  );
  const dirty =
    planName !== plan.name ||
    JSON.stringify(elements) !== JSON.stringify(plan.draft.elements);
  const activeTableCount = elements.filter(
    (element) => element.type === "TABLE" && element.visible,
  ).length;
  const deletableCount = elements.filter(
    (element) => selectedIds.includes(element.id) && !element.locked,
  ).length;
  const capacity = elements
    .filter((element) => element.type === "TABLE" && element.visible)
    .reduce((sum, element) => sum + (element.capacity ?? 0), 0);
  const activeVersion = plan.versions.find(
    (version) => version.id === plan.activeVersionId,
  );

  const notify = useCallback((tone: "success" | "error", message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const commit = useCallback((next: FloorElement[]) => {
    setHistory((value) => commitEditorHistory(value, next));
    previewOrigin.current = null;
  }, []);

  const preview = useCallback((next: FloorElement[]) => {
    setHistory((value) => {
      if (!previewOrigin.current)
        previewOrigin.current = structuredClone(value.present);
      return { ...value, present: next };
    });
  }, []);

  const commitPreview = useCallback((next: FloorElement[]) => {
    setHistory((value) => ({
      past: [
        ...value.past,
        structuredClone(previewOrigin.current ?? value.present),
      ].slice(-40),
      present: structuredClone(next),
      future: [],
    }));
    previewOrigin.current = null;
  }, []);

  const loadPlan = (planId: string) => {
    const next = state.floorPlans.find((item) => item.id === planId);
    if (!next) return;
    if (dirty) {
      notify(
        "error",
        "Save or publish the current draft before switching floors.",
      );
      return;
    }
    setSelectedPlanId(planId);
    setPlanName(next.name);
    setHistory(createEditorHistory(next.draft.elements));
    setSelectedIds([]);
  };

  const addElement = (type: FloorElementType, shape?: TableShape) => {
    const id = `${type.toLowerCase()}-${Date.now()}`;
    const maxZ = Math.max(0, ...elements.map((element) => element.zIndex));
    const created = createFloorElement(type, id, 700, 440, maxZ + 1);
    if (shape) created.shape = shape;
    if (type === "TABLE") {
      const count =
        elements.filter((element) => element.type === "TABLE").length + 1;
      created.label = `T${count}`;
    }
    commit([...elements, created]);
    setSelectedIds([created.id]);
  };

  const updateElement = (id: string, values: Partial<FloorElement>) => {
    commit(
      elements.map((element) =>
        element.id === id ? { ...element, ...values } : element,
      ),
    );
  };

  const duplicate = useCallback(() => {
    if (!selectedIds.length) return;
    const result = duplicateElements(
      elements,
      selectedIds,
      `copy-${Date.now()}`,
    );
    commit(result.elements);
    setSelectedIds(result.selectedIds);
  }, [commit, elements, selectedIds]);

  const deleteSelection = () => {
    const next = elements.filter(
      (element) => !selectedIds.includes(element.id) || element.locked,
    );
    commit(next);
    setSelectedIds([]);
    setDeleteOpen(false);
    notify("success", "Objects removed from the draft. Undo is available.");
  };

  const requestDelete = useCallback(() => {
    if (!selectedIds.length) return;
    if (!deletableCount) {
      notify(
        "error",
        "Unlock at least one selected object before removing it.",
      );
      return;
    }
    setDeleteOpen(true);
  }, [deletableCount, notify, selectedIds.length]);

  const requestNewFloor = () => {
    if (dirty) {
      notify(
        "error",
        "Save or publish the current draft before creating another floor.",
      );
      return;
    }
    setNewFloorOpen(true);
  };

  const save = useCallback(async () => {
    setSaveState("saving");
    const result = await saveFloor(plan.id, planName, elements);
    if (!result.ok) {
      setSaveState("error");
      notify("error", result.error);
      return;
    }
    const savedPlan = result.state?.floorPlans.find((item) => item.id === plan.id);
    setSaveState("saved");
    setPlanName(savedPlan?.name ?? planName);
    setHistory(createEditorHistory(savedPlan?.draft.elements ?? elements));
    notify("success", "Draft saved.");
  }, [elements, notify, plan.id, planName, saveFloor]);

  const publish = async () => {
    setSaveState("saving");
    const result = await publishFloor(plan.id, planName, elements);
    if (!result.ok) {
      setSaveState("error");
      notify("error", result.error);
      return;
    }
    const savedPlan = result.state?.floorPlans.find((item) => item.id === plan.id);
    setPublishOpen(false);
    setSaveState("saved");
    setPlanName(savedPlan?.name ?? planName);
    setHistory(createEditorHistory(savedPlan?.draft.elements ?? elements));
    setSelectedIds([]);
    notify("success", "Floor published. Live floor now uses this version.");
  };

  const restore = (planId: string, versionId: string) => {
    const version = plan.versions.find((item) => item.id === versionId);
    const result = restoreFloor(planId, versionId);
    if (!result.ok || !version) {
      notify("error", result.ok ? "Version not found." : result.error);
      return;
    }
    setPlanName(`${version.name} restored`);
    setHistory(createEditorHistory(version.elements));
    setSelectedIds([]);
    notify("success", `Version ${version.version} restored as a new draft.`);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        setHistory((value) =>
          event.shiftKey ? redoEditorHistory(value) : undoEditorHistory(value),
        );
      } else if (modifier && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicate();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        requestDelete();
      } else if (event.key === "Escape") {
        setSelectedIds([]);
      } else if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
          event.key,
        ) &&
        selectedIds.length
      ) {
        event.preventDefault();
        const amount = event.shiftKey ? 10 : 1;
        const dx =
          event.key === "ArrowLeft"
            ? -amount
            : event.key === "ArrowRight"
              ? amount
              : 0;
        const dy =
          event.key === "ArrowUp"
            ? -amount
            : event.key === "ArrowDown"
              ? amount
              : 0;
        commit(moveSelected(elements, selectedIds, dx, dy));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commit, duplicate, elements, requestDelete, selectedIds]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <div className="flex min-h-[calc(100vh-4.5rem)] flex-col bg-stone-100">
      <div className="hidden items-center justify-between gap-4 border-b border-stone-200 bg-stone-50 px-4 py-2 lg:flex">
        <div className="flex items-center gap-2">
          <Layers3 size={17} className="text-emerald-700" />
          <label className="relative">
            <span className="sr-only">Floor plan</span>
            <select
              value={plan.id}
              onChange={(event) => loadPlan(event.target.value)}
              className="min-h-9 appearance-none rounded-lg border border-stone-300 bg-white pl-3 pr-9 text-sm font-semibold text-stone-700"
            >
              {state.floorPlans.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-3 top-3 text-stone-400"
            />
          </label>
          <button
            type="button"
            onClick={requestNewFloor}
            className="grid h-9 w-9 place-items-center rounded-lg border border-stone-300 bg-white text-stone-600 hover:bg-stone-100"
            aria-label="Create floor plan"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="flex items-center gap-4 text-xs text-stone-500">
          <span>{activeTableCount} active tables</span>
          <span>{capacity} seats</span>
          <span
            className={`rounded-full px-2.5 py-1 font-semibold ${issues.length ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}
          >
            {issues.length ? `${issues.length} warnings` : "Ready to publish"}
          </span>
        </div>
      </div>

      <div className="hidden lg:block">
        <EditorToolbar
          planName={planName}
          version={activeVersion?.version ?? 0}
          dirty={dirty}
          saveState={saveState}
          canUndo={Boolean(history.past.length)}
          canRedo={Boolean(history.future.length)}
          selectionCount={selectedIds.length}
          zoom={zoom}
          gridVisible={gridVisible}
          snapToGrid={snapToGrid}
          panMode={panMode}
          onNameChange={setPlanName}
          onUndo={() => setHistory((value) => undoEditorHistory(value))}
          onRedo={() => setHistory((value) => redoEditorHistory(value))}
          onDuplicate={duplicate}
          onDelete={requestDelete}
          onAlign={(alignment) =>
            commit(alignElements(elements, selectedIds, alignment))
          }
          onDistribute={(axis) =>
            commit(distributeElements(elements, selectedIds, axis))
          }
          onArrange={(direction) =>
            commit(reorderElement(elements, selectedIds, direction))
          }
          onToggleGrid={() => setGridVisible((value) => !value)}
          onToggleSnap={() => setSnapToGrid((value) => !value)}
          onTogglePan={() => setPanMode((value) => !value)}
          onZoom={(value) =>
            setZoom(Math.min(2, Math.max(0.25, Number(value.toFixed(2)))))
          }
          onFit={() => {
            setZoom(0.5);
            setOffset({ x: 38, y: 35 });
          }}
          onSave={save}
          onPublish={() => setPublishOpen(true)}
        />
      </div>

      <div className="hidden min-h-0 flex-1 lg:flex">
        <FloorLibrary onAdd={addElement} />
        <div className="min-w-0 flex-1">
          <FloorCanvas
            elements={elements}
            selectedIds={selectedIds}
            zoom={zoom}
            offset={offset}
            gridVisible={gridVisible}
            snapToGrid={snapToGrid}
            panMode={panMode}
            onSelect={(id, additive) =>
              setSelectedIds((value) => selectElement(value, id, additive))
            }
            onSelectMany={setSelectedIds}
            onPreview={preview}
            onCommit={commitPreview}
            onOffsetChange={setOffset}
          />
        </div>
        <div className="flex w-80 shrink-0 flex-col overflow-y-auto">
          <FloorInspector
            elements={elements}
            selectedIds={selectedIds}
            onSelect={setSelectedIds}
            onUpdate={updateElement}
            onToggleVisible={(id) =>
              updateElement(id, {
                visible: !elements.find((element) => element.id === id)
                  ?.visible,
              })
            }
          />
          <section className="border-l border-t border-stone-200 bg-white p-4">
            <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">
              Validation
            </h2>
            <div className="mt-3 space-y-2">
              {issues.slice(0, 5).map((issue, index) => (
                <button
                  key={`${issue.code}-${index}`}
                  type="button"
                  onClick={() => setSelectedIds(issue.elementIds)}
                  className="flex w-full gap-2 rounded-lg bg-amber-50 p-2.5 text-left text-xs leading-5 text-amber-900"
                >
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  {issue.message}
                </button>
              ))}
              {!issues.length && (
                <p className="flex gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
                  <CheckCircle2 size={15} /> No layout warnings.
                </p>
              )}
            </div>
          </section>
          <PublishedHistory
            planId={plan.id}
            versions={plan.versions}
            onRestore={restore}
          />
        </div>
      </div>

      <div className="grid flex-1 place-items-center p-6 lg:hidden">
        <section className="max-w-lg rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
          <Layers3 className="mx-auto text-emerald-700" />
          <h2 className="mt-4 text-lg font-bold text-stone-900">
            Floor editor needs a larger screen
          </h2>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            Use a tablet in landscape or a desktop at least 1024 pixels wide.
            Live floor remains fully usable on mobile.
          </p>
        </section>
      </div>

      <Modal
        open={publishOpen}
        title={`Create version ${(activeVersion?.version ?? 0) + 1}?`}
        description="Live floor will switch to this immutable snapshot only after you confirm."
        onClose={() => setPublishOpen(false)}
      >
        <dl className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-stone-50 p-3">
            <dt className="text-xs text-stone-500">Tables</dt>
            <dd className="mt-1 text-lg font-bold text-stone-900">
              {activeTableCount}
            </dd>
          </div>
          <div className="rounded-xl bg-stone-50 p-3">
            <dt className="text-xs text-stone-500">Capacity</dt>
            <dd className="mt-1 text-lg font-bold text-stone-900">
              {capacity}
            </dd>
          </div>
          <div className="rounded-xl bg-stone-50 p-3">
            <dt className="text-xs text-stone-500">Warnings</dt>
            <dd className="mt-1 text-lg font-bold text-stone-900">
              {issues.length}
            </dd>
          </div>
        </dl>
        {issues.length > 0 && (
          <div className="mt-4 max-h-32 space-y-1 overflow-auto rounded-xl bg-amber-50 p-3">
            {issues.map((issue, index) => (
              <p
                key={`${issue.code}-${index}`}
                className="text-xs text-amber-900"
              >
                • {issue.message}
              </p>
            ))}
          </div>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setPublishOpen(false)}
            className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-semibold text-stone-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={publish}
            className="min-h-11 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900"
          >
            Publish version
          </button>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        title={`Remove ${deletableCount} selected ${deletableCount === 1 ? "object" : "objects"}?`}
        description="This affects only the draft. The published Live floor stays unchanged, and you can undo the removal."
        onClose={() => setDeleteOpen(false)}
        width="max-w-md"
      >
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setDeleteOpen(false)}
            className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-semibold text-stone-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={deleteSelection}
            className="min-h-11 rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white"
          >
            Remove
          </button>
        </div>
      </Modal>

      <Modal
        open={newFloorOpen}
        title="Create another floor"
        onClose={() => setNewFloorOpen(false)}
        width="max-w-md"
      >
        <label className="block text-sm font-semibold text-stone-700">
          Floor name
          <input
            autoFocus
            value={newFloorName}
            onChange={(event) => setNewFloorName(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-stone-300 px-3 text-sm"
            placeholder="Patio or Second floor"
          />
        </label>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setNewFloorOpen(false)}
            className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-semibold text-stone-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!newFloorName.trim()}
            onClick={() => {
              const id = createFloor(newFloorName);
              if (!id) {
                notify(
                  "error",
                  "Creating a database-backed floor is not enabled yet.",
                );
                setNewFloorOpen(false);
                return;
              }
              setSelectedPlanId(id);
              setPlanName(newFloorName.trim());
              setHistory(createEditorHistory([]));
              setSelectedIds([]);
              setNewFloorName("");
              setNewFloorOpen(false);
            }}
            className="min-h-11 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            Create floor
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
