"use client";

import {
  AlignCenter,
  AlignHorizontalDistributeCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalDistributeCenter,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Copy,
  Grid2X2,
  Hand,
  Maximize2,
  MousePointer2,
  Redo2,
  Save,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

interface EditorToolbarProps {
  planName: string;
  version: number;
  dirty: boolean;
  saveState: "saved" | "saving" | "error";
  canUndo: boolean;
  canRedo: boolean;
  selectionCount: number;
  zoom: number;
  gridVisible: boolean;
  snapToGrid: boolean;
  panMode: boolean;
  onNameChange: (name: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAlign: (alignment: "LEFT" | "CENTER" | "RIGHT") => void;
  onDistribute: (axis: "HORIZONTAL" | "VERTICAL") => void;
  onArrange: (direction: "FRONT" | "FORWARD" | "BACKWARD" | "BACK") => void;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
  onTogglePan: () => void;
  onZoom: (zoom: number) => void;
  onFit: () => void;
  onSave: () => void;
  onPublish: () => void;
}

function ToolButton({
  label,
  disabled,
  active,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-9 w-9 place-items-center rounded-lg border text-stone-600 transition disabled:cursor-not-allowed disabled:opacity-35 ${active ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-transparent hover:border-stone-200 hover:bg-stone-50"}`}
    >
      {children}
    </button>
  );
}

export function EditorToolbar(props: EditorToolbarProps) {
  return (
    <header className="border-b border-stone-200 bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-2 min-w-48">
          <input
            value={props.planName}
            onChange={(event) => props.onNameChange(event.target.value)}
            className="w-full rounded-md border border-transparent px-2 py-1 text-sm font-semibold text-stone-900 hover:border-stone-200 focus:border-emerald-500 focus:outline-none"
            aria-label="Floor plan name"
          />
          <p className="px-2 text-[10px] text-stone-400">
            Published v{props.version || "—"} ·{" "}
            {props.dirty
              ? "Unsaved changes"
              : props.saveState === "saving"
                ? "Saving…"
                : props.saveState === "error"
                  ? "Save error"
                  : "Saved"}
          </p>
        </div>
        <span className="h-7 w-px bg-stone-200" />
        <ToolButton
          label="Undo (Ctrl+Z)"
          disabled={!props.canUndo}
          onClick={props.onUndo}
        >
          <Undo2 size={17} />
        </ToolButton>
        <ToolButton
          label="Redo (Ctrl+Shift+Z)"
          disabled={!props.canRedo}
          onClick={props.onRedo}
        >
          <Redo2 size={17} />
        </ToolButton>
        <span className="h-7 w-px bg-stone-200" />
        <ToolButton
          label="Select tool"
          active={!props.panMode}
          onClick={props.onTogglePan}
        >
          <MousePointer2 size={17} />
        </ToolButton>
        <ToolButton
          label="Pan tool"
          active={props.panMode}
          onClick={props.onTogglePan}
        >
          <Hand size={17} />
        </ToolButton>
        <ToolButton
          label="Duplicate (Ctrl+D)"
          disabled={!props.selectionCount}
          onClick={props.onDuplicate}
        >
          <Copy size={17} />
        </ToolButton>
        <ToolButton
          label="Delete"
          disabled={!props.selectionCount}
          onClick={props.onDelete}
        >
          <Trash2 size={17} />
        </ToolButton>
        <span className="h-7 w-px bg-stone-200" />
        <ToolButton
          label="Align left"
          disabled={props.selectionCount < 2}
          onClick={() => props.onAlign("LEFT")}
        >
          <AlignLeft size={17} />
        </ToolButton>
        <ToolButton
          label="Align center"
          disabled={props.selectionCount < 2}
          onClick={() => props.onAlign("CENTER")}
        >
          <AlignCenter size={17} />
        </ToolButton>
        <ToolButton
          label="Align right"
          disabled={props.selectionCount < 2}
          onClick={() => props.onAlign("RIGHT")}
        >
          <AlignRight size={17} />
        </ToolButton>
        <ToolButton
          label="Distribute horizontally"
          disabled={props.selectionCount < 3}
          onClick={() => props.onDistribute("HORIZONTAL")}
        >
          <AlignHorizontalDistributeCenter size={17} />
        </ToolButton>
        <ToolButton
          label="Distribute vertically"
          disabled={props.selectionCount < 3}
          onClick={() => props.onDistribute("VERTICAL")}
        >
          <AlignVerticalDistributeCenter size={17} />
        </ToolButton>
        <ToolButton
          label="Bring to front"
          disabled={!props.selectionCount}
          onClick={() => props.onArrange("FRONT")}
        >
          <ArrowUpToLine size={17} />
        </ToolButton>
        <ToolButton
          label="Bring forward"
          disabled={!props.selectionCount}
          onClick={() => props.onArrange("FORWARD")}
        >
          <ArrowUp size={17} />
        </ToolButton>
        <ToolButton
          label="Send backward"
          disabled={!props.selectionCount}
          onClick={() => props.onArrange("BACKWARD")}
        >
          <ArrowDown size={17} />
        </ToolButton>
        <ToolButton
          label="Send to back"
          disabled={!props.selectionCount}
          onClick={() => props.onArrange("BACK")}
        >
          <ArrowDownToLine size={17} />
        </ToolButton>
        <span className="h-7 w-px bg-stone-200" />
        <ToolButton
          label="Toggle grid"
          active={props.gridVisible}
          onClick={props.onToggleGrid}
        >
          <Grid2X2 size={17} />
        </ToolButton>
        <button
          type="button"
          onClick={props.onToggleSnap}
          className={`min-h-9 rounded-lg px-2 text-[11px] font-semibold ${props.snapToGrid ? "bg-emerald-50 text-emerald-800" : "text-stone-500 hover:bg-stone-50"}`}
        >
          Snap
        </button>
        <ToolButton
          label="Zoom out"
          disabled={props.zoom <= 0.25}
          onClick={() => props.onZoom(props.zoom - 0.1)}
        >
          <ZoomOut size={17} />
        </ToolButton>
        <span className="w-11 text-center text-[11px] font-semibold text-stone-500">
          {Math.round(props.zoom * 100)}%
        </span>
        <ToolButton
          label="Zoom in"
          disabled={props.zoom >= 2}
          onClick={() => props.onZoom(props.zoom + 0.1)}
        >
          <ZoomIn size={17} />
        </ToolButton>
        <ToolButton label="Fit floor to screen" onClick={props.onFit}>
          <Maximize2 size={17} />
        </ToolButton>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={props.onSave}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700 hover:bg-stone-50"
          >
            <Save size={16} /> Save draft
          </button>
          <button
            type="button"
            onClick={props.onPublish}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-800 px-3.5 text-sm font-semibold text-white hover:bg-emerald-900"
          >
            <Upload size={16} /> Publish
          </button>
        </div>
      </div>
    </header>
  );
}
