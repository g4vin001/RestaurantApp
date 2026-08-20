import type { TableShape } from "@/lib/domain/types";

export type PublicTableStatus =
  | "AVAILABLE"
  | "RESERVED"
  | "IN_USE"
  | "PREPARING"
  | "UNAVAILABLE";

export type PublicFloorElementType =
  | "TABLE"
  | "WALL"
  | "DOOR"
  | "WAITING_AREA"
  | "RESTROOM"
  | "COLUMN"
  | "ZONE";

export type PublicFloorSource = {
  id: string;
  name: string;
  logicalWidth: number;
  logicalHeight: number;
  activeVersion: {
    id: string;
    version: number;
    publishedAt: Date | null;
    createdAt: Date;
    elements: Array<{
      stableElementId: string;
      type: string;
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number;
      zIndex: number;
      visible: boolean;
      label: string;
      zone: string | null;
      shape: TableShape | null;
      diningTable: {
        id: string;
        label: string;
        capacity: number;
        zone: string;
        shape: TableShape;
        currentStatus: string;
        active: boolean;
        archivedAt: Date | null;
      } | null;
    }>;
  } | null;
};

export type PublicFloorElement = {
  id: string;
  type: PublicFloorElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  label?: string;
  zone?: string;
  shape?: TableShape;
  tableId?: string;
  capacity?: number;
  status?: PublicTableStatus;
};

export type PublicFloorView = {
  id: string;
  name: string;
  version: number;
  logicalWidth: number;
  logicalHeight: number;
  publishedAt: string;
  elements: PublicFloorElement[];
};

const PUBLIC_STRUCTURE_TYPES = new Set<PublicFloorElementType>([
  "WALL",
  "DOOR",
  "WAITING_AREA",
  "RESTROOM",
  "COLUMN",
  "ZONE",
]);

export function toPublicTableStatus(status: string): PublicTableStatus {
  if (status === "AVAILABLE") return "AVAILABLE";
  if (status === "RESERVED") return "RESERVED";
  if (status === "OCCUPIED") return "IN_USE";
  if (status === "CLEANING") return "PREPARING";
  return "UNAVAILABLE";
}

function publicStructureLabel(type: PublicFloorElementType, label: string) {
  const trimmed = label.trim();
  if (type === "RESTROOM") return trimmed || "Restroom";
  if (type === "WAITING_AREA") return trimmed || "Waiting area";
  if (type === "ZONE") return trimmed || undefined;
  if (type === "DOOR") return trimmed || undefined;
  return undefined;
}

export function buildPublicFloor(
  plan: PublicFloorSource | null | undefined,
): PublicFloorView | null {
  const version = plan?.activeVersion;
  if (!plan || !version) return null;

  const elements: PublicFloorElement[] = [];
  for (const element of version.elements) {
    if (!element.visible) continue;

    if (element.type === "TABLE") {
      const table = element.diningTable;
      if (!table || !table.active || table.archivedAt) continue;
      elements.push({
        id: element.stableElementId,
        type: "TABLE",
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        rotation: element.rotation,
        zIndex: element.zIndex,
        label: table.label,
        zone: table.zone,
        shape: table.shape,
        tableId: table.id,
        capacity: table.capacity,
        status: toPublicTableStatus(table.currentStatus),
      });
      continue;
    }

    if (!PUBLIC_STRUCTURE_TYPES.has(element.type as PublicFloorElementType)) {
      continue;
    }
    const type = element.type as PublicFloorElementType;
    elements.push({
      id: element.stableElementId,
      type,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      rotation: element.rotation,
      zIndex: element.zIndex,
      ...(element.zone ? { zone: element.zone } : {}),
      ...(publicStructureLabel(type, element.label)
        ? { label: publicStructureLabel(type, element.label) }
        : {}),
    });
  }

  return {
    id: plan.id,
    name: plan.name,
    version: version.version,
    logicalWidth: plan.logicalWidth,
    logicalHeight: plan.logicalHeight,
    publishedAt: (version.publishedAt ?? version.createdAt).toISOString(),
    elements,
  };
}
