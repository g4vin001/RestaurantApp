"use client";

import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Rnd } from "react-rnd";
import {
  Armchair,
  Columns3,
  CookingPot,
  DoorOpen,
  Grip,
  Minus,
  PanelTop,
  Square,
  Type,
  UsersRound,
} from "lucide-react";
import type { FloorElement } from "@/lib/domain/types";

interface FloorCanvasProps {
  elements: FloorElement[];
  selectedIds: string[];
  zoom: number;
  offset: { x: number; y: number };
  gridVisible: boolean;
  snapToGrid: boolean;
  panMode: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onSelectMany: (ids: string[]) => void;
  onPreview: (elements: FloorElement[]) => void;
  onCommit: (elements: FloorElement[]) => void;
  onOffsetChange: (offset: { x: number; y: number }) => void;
}

const GRID_SIZE = 20;

function snap(value: number, enabled: boolean) {
  return enabled
    ? Math.round(value / GRID_SIZE) * GRID_SIZE
    : Math.round(value);
}

function ElementIcon({ element }: { element: FloorElement }) {
  const props = { size: 20, strokeWidth: 1.8 };
  if (element.type === "DOOR") return <DoorOpen {...props} />;
  if (element.type === "HOST_STAND") return <PanelTop {...props} />;
  if (element.type === "WAITING_AREA") return <UsersRound {...props} />;
  if (element.type === "KITCHEN") return <CookingPot {...props} />;
  if (element.type === "COLUMN") return <Columns3 {...props} />;
  if (element.type === "TEXT") return <Type {...props} />;
  if (element.type === "WALL") return <Minus {...props} />;
  if (element.type === "TABLE")
    return element.shape === "BOOTH" ? (
      <Armchair {...props} />
    ) : (
      <Square {...props} />
    );
  return <Grip {...props} />;
}

function FloorObject({
  element,
  selected,
}: {
  element: FloorElement;
  selected: boolean;
}) {
  const isZone = element.type === "ZONE";
  const isTable = element.type === "TABLE";
  const shape =
    isTable && element.shape === "ROUND"
      ? "rounded-full"
      : isTable && element.shape === "BOOTH"
        ? "rounded-3xl"
        : "rounded-xl";
  return (
    <div
      className={`flex h-full w-full select-none items-center justify-center border-2 text-center transition-shadow ${shape} ${isZone ? "border-dashed border-stone-300 bg-stone-100/45 text-stone-500" : isTable ? "border-emerald-300 bg-emerald-50 text-emerald-950 shadow-sm" : "border-stone-300 bg-white text-stone-700 shadow-sm"} ${selected ? "ring-4 ring-sky-500/70 ring-offset-2" : ""} ${element.locked ? "opacity-75" : ""}`}
      style={{ transform: `rotate(${element.rotation}deg)` }}
    >
      <span className="pointer-events-none flex flex-col items-center gap-1 px-2">
        <ElementIcon element={element} />
        <strong className="max-w-full truncate text-xs">{element.label}</strong>
        {isTable && (
          <span className="text-[10px] text-emerald-700">
            {element.capacity} seats
          </span>
        )}
      </span>
    </div>
  );
}

export function FloorCanvas({
  elements,
  selectedIds,
  zoom,
  offset,
  gridVisible,
  snapToGrid,
  panMode,
  onSelect,
  onSelectMany,
  onPreview,
  onCommit,
  onOffsetChange,
}: FloorCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragOrigin = useRef<{
    elements: FloorElement[];
    anchorId: string;
  } | null>(null);
  const panOrigin = useRef<{
    clientX: number;
    clientY: number;
    offset: { x: number; y: number };
  } | null>(null);
  const [marquee, setMarquee] = useState<{
    startX: number;
    startY: number;
    x: number;
    y: number;
  } | null>(null);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});

  const alignmentGuides = (
    anchor: FloorElement,
    x: number,
    y: number,
    movingIds: string[],
  ) => {
    const result: { x?: number; y?: number } = {};
    const horizontalPoints = [x, x + anchor.width / 2, x + anchor.width];
    const verticalPoints = [y, y + anchor.height / 2, y + anchor.height];
    for (const other of elements.filter(
      (item) => item.visible && !movingIds.includes(item.id),
    )) {
      const otherHorizontal = [
        other.x,
        other.x + other.width / 2,
        other.x + other.width,
      ];
      const otherVertical = [
        other.y,
        other.y + other.height / 2,
        other.y + other.height,
      ];
      const xMatch = horizontalPoints.find((point) =>
        otherHorizontal.some((candidate) => Math.abs(point - candidate) <= 6),
      );
      const yMatch = verticalPoints.find((point) =>
        otherVertical.some((candidate) => Math.abs(point - candidate) <= 6),
      );
      if (xMatch !== undefined) result.x = xMatch;
      if (yMatch !== undefined) result.y = yMatch;
      if (result.x !== undefined && result.y !== undefined) break;
    }
    return result;
  };

  const logicalPoint = (clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    return {
      x: rect ? (clientX - rect.left) / zoom : 0,
      y: rect ? (clientY - rect.top) / zoom : 0,
    };
  };

  const handleStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (panMode) {
      panOrigin.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        offset,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const point = logicalPoint(event.clientX, event.clientY);
    setMarquee({ startX: point.x, startY: point.y, x: point.x, y: point.y });
    onSelectMany([]);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panOrigin.current) {
      onOffsetChange({
        x:
          panOrigin.current.offset.x +
          event.clientX -
          panOrigin.current.clientX,
        y:
          panOrigin.current.offset.y +
          event.clientY -
          panOrigin.current.clientY,
      });
      return;
    }
    if (!marquee) return;
    const point = logicalPoint(event.clientX, event.clientY);
    setMarquee((value) =>
      value ? { ...value, x: point.x, y: point.y } : null,
    );
  };

  const handleStagePointerUp = () => {
    panOrigin.current = null;
    if (!marquee) return;
    const left = Math.min(marquee.startX, marquee.x);
    const top = Math.min(marquee.startY, marquee.y);
    const right = Math.max(marquee.startX, marquee.x);
    const bottom = Math.max(marquee.startY, marquee.y);
    if (right - left > 5 || bottom - top > 5) {
      onSelectMany(
        elements
          .filter(
            (element) =>
              element.visible &&
              element.x < right &&
              element.x + element.width > left &&
              element.y < bottom &&
              element.y + element.height > top,
          )
          .map((element) => element.id),
      );
    }
    setMarquee(null);
  };

  return (
    <div
      className={`relative h-full min-h-[620px] overflow-hidden bg-stone-200 ${panMode ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div
        ref={stageRef}
        className="absolute h-[1000px] w-[1600px] overflow-visible border-2 border-stone-400 bg-[#fffdf8] shadow-2xl"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          transformOrigin: "top left",
          backgroundImage: gridVisible
            ? "linear-gradient(to right, #e7e5e4 1px, transparent 1px), linear-gradient(to bottom, #e7e5e4 1px, transparent 1px)"
            : undefined,
          backgroundSize: gridVisible
            ? `${GRID_SIZE}px ${GRID_SIZE}px`
            : undefined,
        }}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerUp}
        onPointerCancel={handleStagePointerUp}
      >
        {elements
          .filter((element) => element.visible)
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((element) => {
            const selected = selectedIds.includes(element.id);
            return (
              <Rnd
                key={element.id}
                bounds="parent"
                scale={zoom}
                position={{ x: element.x, y: element.y }}
                size={{ width: element.width, height: element.height }}
                disableDragging={element.locked || panMode}
                enableResizing={selected && !element.locked && !panMode}
                minWidth={40}
                minHeight={30}
                dragGrid={snapToGrid ? [GRID_SIZE, GRID_SIZE] : undefined}
                resizeGrid={snapToGrid ? [GRID_SIZE, GRID_SIZE] : undefined}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  onSelect(element.id, event.shiftKey);
                }}
                onDragStart={() => {
                  const ids = selectedIds.includes(element.id)
                    ? selectedIds
                    : [element.id];
                  dragOrigin.current = {
                    elements: structuredClone(elements),
                    anchorId: element.id,
                  };
                  if (!selectedIds.includes(element.id)) onSelectMany(ids);
                }}
                onDrag={(_event, data) => {
                  const origin = dragOrigin.current;
                  if (!origin) return;
                  const anchor = origin.elements.find(
                    (item) => item.id === origin.anchorId,
                  );
                  if (!anchor) return;
                  const dx = snap(data.x, snapToGrid) - anchor.x;
                  const dy = snap(data.y, snapToGrid) - anchor.y;
                  const ids = selectedIds.includes(element.id)
                    ? selectedIds
                    : [element.id];
                  setGuides(
                    alignmentGuides(anchor, anchor.x + dx, anchor.y + dy, ids),
                  );
                  onPreview(
                    origin.elements.map((item) =>
                      ids.includes(item.id) && !item.locked
                        ? { ...item, x: item.x + dx, y: item.y + dy }
                        : item,
                    ),
                  );
                }}
                onDragStop={(_event, data) => {
                  const origin = dragOrigin.current;
                  if (!origin) return;
                  const anchor = origin.elements.find(
                    (item) => item.id === origin.anchorId,
                  );
                  if (!anchor) return;
                  const dx = snap(data.x, snapToGrid) - anchor.x;
                  const dy = snap(data.y, snapToGrid) - anchor.y;
                  const ids = selectedIds.includes(element.id)
                    ? selectedIds
                    : [element.id];
                  onCommit(
                    origin.elements.map((item) =>
                      ids.includes(item.id) && !item.locked
                        ? { ...item, x: item.x + dx, y: item.y + dy }
                        : item,
                    ),
                  );
                  dragOrigin.current = null;
                  setGuides({});
                }}
                onResizeStart={() => {
                  dragOrigin.current = {
                    elements: structuredClone(elements),
                    anchorId: element.id,
                  };
                }}
                onResize={(_event, _direction, ref, _delta, position) => {
                  onPreview(
                    elements.map((item) =>
                      item.id === element.id
                        ? {
                            ...item,
                            x: snap(position.x, snapToGrid),
                            y: snap(position.y, snapToGrid),
                            width: snap(ref.offsetWidth, snapToGrid),
                            height: snap(ref.offsetHeight, snapToGrid),
                          }
                        : item,
                    ),
                  );
                }}
                onResizeStop={(_event, _direction, ref, _delta, position) => {
                  const origin = dragOrigin.current?.elements ?? elements;
                  onCommit(
                    origin.map((item) =>
                      item.id === element.id
                        ? {
                            ...item,
                            x: snap(position.x, snapToGrid),
                            y: snap(position.y, snapToGrid),
                            width: snap(ref.offsetWidth, snapToGrid),
                            height: snap(ref.offsetHeight, snapToGrid),
                          }
                        : item,
                    ),
                  );
                  dragOrigin.current = null;
                  setGuides({});
                }}
                style={{ zIndex: element.zIndex }}
              >
                <FloorObject element={element} selected={selected} />
              </Rnd>
            );
          })}
        {marquee && (
          <div
            className="pointer-events-none absolute border-2 border-sky-500 bg-sky-200/25"
            style={{
              left: Math.min(marquee.startX, marquee.x),
              top: Math.min(marquee.startY, marquee.y),
              width: Math.abs(marquee.x - marquee.startX),
              height: Math.abs(marquee.y - marquee.startY),
              zIndex: 9999,
            }}
          />
        )}
        {guides.x !== undefined && (
          <div
            className="pointer-events-none absolute bottom-0 top-0 w-px bg-fuchsia-500"
            style={{ left: guides.x, zIndex: 9998 }}
            aria-hidden="true"
          />
        )}
        {guides.y !== undefined && (
          <div
            className="pointer-events-none absolute left-0 right-0 h-px bg-fuchsia-500"
            style={{ top: guides.y, zIndex: 9998 }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}
