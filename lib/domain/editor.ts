import { HISTORY_LIMIT } from "@/lib/domain/floor-plan";
import type {
  FloorElement,
  FloorElementType,
  TableShape,
} from "@/lib/domain/types";

export interface EditorHistory {
  past: FloorElement[][];
  present: FloorElement[];
  future: FloorElement[][];
}

export function createEditorHistory(elements: FloorElement[]): EditorHistory {
  return { past: [], present: structuredClone(elements), future: [] };
}

export function commitEditorHistory(
  history: EditorHistory,
  elements: FloorElement[],
): EditorHistory {
  if (JSON.stringify(history.present) === JSON.stringify(elements))
    return history;
  return {
    past: [...history.past, structuredClone(history.present)].slice(
      -HISTORY_LIMIT,
    ),
    present: structuredClone(elements),
    future: [],
  };
}

export function undoEditorHistory(history: EditorHistory): EditorHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: structuredClone(previous),
    future: [structuredClone(history.present), ...history.future].slice(
      0,
      HISTORY_LIMIT,
    ),
  };
}

export function redoEditorHistory(history: EditorHistory): EditorHistory {
  const next = history.future[0];
  if (!next) return history;
  return {
    past: [...history.past, structuredClone(history.present)].slice(
      -HISTORY_LIMIT,
    ),
    present: structuredClone(next),
    future: history.future.slice(1),
  };
}

export function selectElement(
  selection: string[],
  id: string,
  additive: boolean,
) {
  if (!additive) return [id];
  return selection.includes(id)
    ? selection.filter((item) => item !== id)
    : [...selection, id];
}

const defaults: Record<
  FloorElementType,
  { label: string; width: number; height: number; shape?: TableShape }
> = {
  TABLE: { label: "New table", width: 160, height: 140, shape: "SQUARE" },
  BAR: { label: "Bar / counter", width: 360, height: 100 },
  WALL: { label: "Wall", width: 400, height: 24 },
  DOOR: { label: "Door", width: 160, height: 36 },
  HOST_STAND: { label: "Host stand", width: 220, height: 90 },
  WAITING_AREA: { label: "Waiting area", width: 380, height: 150 },
  KITCHEN: { label: "Kitchen / service", width: 400, height: 280 },
  RESTROOM: { label: "Restroom", width: 180, height: 160 },
  COLUMN: { label: "Column", width: 80, height: 80 },
  TEXT: { label: "Text label", width: 240, height: 70 },
  ZONE: { label: "New zone", width: 500, height: 320 },
};

export function createFloorElement(
  type: FloorElementType,
  id: string,
  x: number,
  y: number,
  zIndex: number,
): FloorElement {
  const value = defaults[type];
  return {
    id,
    type,
    label: value.label,
    x,
    y,
    width: value.width,
    height: value.height,
    rotation: 0,
    zIndex,
    locked: false,
    visible: true,
    color: type === "TABLE" ? "emerald" : "stone",
    ...(type === "TABLE"
      ? {
          tableId: `table-${id}`,
          shape: value.shape,
          capacity: 4,
          minPartySize: 1,
          maxPartySize: 4,
          zone: "Main dining",
        }
      : {}),
  };
}

export function duplicateElements(
  elements: FloorElement[],
  selectedIds: string[],
  idPrefix: string,
) {
  const selected = elements.filter((element) =>
    selectedIds.includes(element.id),
  );
  const copies = selected.map((element, index) => ({
    ...structuredClone(element),
    id: `${idPrefix}-${index}`,
    tableId:
      element.type === "TABLE" ? `table-${idPrefix}-${index}` : undefined,
    label: `${element.label} copy`,
    x: element.x + 32,
    y: element.y + 32,
    zIndex: Math.max(0, ...elements.map((item) => item.zIndex)) + index + 1,
  }));
  return {
    elements: [...elements, ...copies],
    selectedIds: copies.map((copy) => copy.id),
  };
}

export function moveSelected(
  elements: FloorElement[],
  selectedIds: string[],
  dx: number,
  dy: number,
) {
  return elements.map((element) =>
    selectedIds.includes(element.id) && !element.locked
      ? { ...element, x: element.x + dx, y: element.y + dy }
      : element,
  );
}

export type Alignment =
  | "LEFT"
  | "CENTER"
  | "RIGHT"
  | "TOP"
  | "MIDDLE"
  | "BOTTOM";

export function alignElements(
  elements: FloorElement[],
  selectedIds: string[],
  alignment: Alignment,
) {
  const selected = elements.filter(
    (element) => selectedIds.includes(element.id) && !element.locked,
  );
  if (selected.length < 2) return elements;
  const left = Math.min(...selected.map((element) => element.x));
  const right = Math.max(
    ...selected.map((element) => element.x + element.width),
  );
  const top = Math.min(...selected.map((element) => element.y));
  const bottom = Math.max(
    ...selected.map((element) => element.y + element.height),
  );
  const center = (left + right) / 2;
  const middle = (top + bottom) / 2;
  return elements.map((element) => {
    if (!selectedIds.includes(element.id) || element.locked) return element;
    if (alignment === "LEFT") return { ...element, x: left };
    if (alignment === "CENTER")
      return { ...element, x: center - element.width / 2 };
    if (alignment === "RIGHT") return { ...element, x: right - element.width };
    if (alignment === "TOP") return { ...element, y: top };
    if (alignment === "MIDDLE")
      return { ...element, y: middle - element.height / 2 };
    return { ...element, y: bottom - element.height };
  });
}

export function distributeElements(
  elements: FloorElement[],
  selectedIds: string[],
  axis: "HORIZONTAL" | "VERTICAL",
) {
  const selected = elements
    .filter((element) => selectedIds.includes(element.id) && !element.locked)
    .sort((a, b) => (axis === "HORIZONTAL" ? a.x - b.x : a.y - b.y));
  if (selected.length < 3) return elements;
  const first = selected[0];
  const last = selected.at(-1) as FloorElement;
  const span = axis === "HORIZONTAL" ? last.x - first.x : last.y - first.y;
  const gap = span / (selected.length - 1);
  const positions = new Map(
    selected.map((element, index) => [
      element.id,
      (axis === "HORIZONTAL" ? first.x : first.y) + gap * index,
    ]),
  );
  return elements.map((element) => {
    const position = positions.get(element.id);
    if (position === undefined) return element;
    return axis === "HORIZONTAL"
      ? { ...element, x: position }
      : { ...element, y: position };
  });
}

export function reorderElement(
  elements: FloorElement[],
  selectedIds: string[],
  direction: "FRONT" | "FORWARD" | "BACKWARD" | "BACK",
) {
  const values = elements.map((element) => element.zIndex);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return elements.map((element) => {
    if (!selectedIds.includes(element.id) || element.locked) return element;
    if (direction === "FRONT") return { ...element, zIndex: max + 1 };
    if (direction === "BACK") return { ...element, zIndex: min - 1 };
    if (direction === "FORWARD")
      return { ...element, zIndex: element.zIndex + 1 };
    return { ...element, zIndex: element.zIndex - 1 };
  });
}
