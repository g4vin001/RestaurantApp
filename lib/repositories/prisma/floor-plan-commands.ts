import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { validateFloor } from "@/lib/domain/floor-plan";
import type {
  FloorElement,
  FloorElementType,
  TableShape,
} from "@/lib/domain/types";
import { OperationsRepositoryError } from "@/lib/repositories/operations";
import type { PrismaOperationsScope } from "./prisma-operations";

const FLOOR_ELEMENT_TYPES = new Set<FloorElementType>([
  "TABLE",
  "BAR",
  "WALL",
  "DOOR",
  "HOST_STAND",
  "WAITING_AREA",
  "KITCHEN",
  "RESTROOM",
  "COLUMN",
  "TEXT",
  "ZONE",
]);

const TABLE_SHAPES = new Set<TableShape>([
  "ROUND",
  "SQUARE",
  "RECTANGLE",
  "BOOTH",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type FloorPlanMutationInput = {
  planId: string;
  name: string;
  elements: FloorElement[];
  draftRevision: number;
};

function invalid(message: string): never {
  throw new OperationsRepositoryError("VALIDATION", message);
}

function finite(value: unknown, field: string, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    invalid(`${field} must be a number between ${min} and ${max}.`);
  }
  return value;
}

function integer(value: unknown, field: string, min: number, max: number) {
  const parsed = finite(value, field, min, max);
  if (!Number.isInteger(parsed)) invalid(`${field} must be a whole number.`);
  return parsed;
}

function text(value: unknown, field: string, maxLength: number, required = false) {
  if (typeof value !== "string") {
    if (required) invalid(`${field} is required.`);
    return undefined;
  }
  const trimmed = value.trim();
  if (required && !trimmed) invalid(`${field} is required.`);
  if (trimmed.length > maxLength) invalid(`${field} must be ${maxLength} characters or fewer.`);
  return trimmed || undefined;
}

function parseElement(value: unknown): FloorElement {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("Each floor element must be an object.");
  }
  const raw = value as Record<string, unknown>;
  const id = text(raw.id, "Element ID", 160, true) as string;
  const type = raw.type;
  if (typeof type !== "string" || !FLOOR_ELEMENT_TYPES.has(type as FloorElementType)) {
    invalid("Each floor element needs a valid type.");
  }
  const shape = raw.shape;
  if (shape !== undefined && (typeof shape !== "string" || !TABLE_SHAPES.has(shape as TableShape))) {
    invalid("Table shape is invalid.");
  }
  const tableId = text(raw.tableId, "Table ID", 160);
  const label = text(raw.label, "Element label", 120) ?? "";
  const zone = text(raw.zone, "Zone", 120);
  const notes = text(raw.notes, "Notes", 2_000);
  const color = text(raw.color, "Color", 80);
  const element: FloorElement = {
    id,
    type: type as FloorElementType,
    x: finite(raw.x, "Element x", -10_000, 10_000),
    y: finite(raw.y, "Element y", -10_000, 10_000),
    width: finite(raw.width, "Element width", 1, 10_000),
    height: finite(raw.height, "Element height", 1, 10_000),
    rotation: finite(raw.rotation, "Element rotation", -3_600, 3_600),
    zIndex: integer(raw.zIndex, "Element z-index", -10_000, 10_000),
    locked: raw.locked === true,
    visible: raw.visible !== false,
    label,
    ...(zone ? { zone } : {}),
    ...(tableId ? { tableId } : {}),
    ...(shape ? { shape: shape as TableShape } : {}),
    ...(raw.capacity === undefined
      ? {}
      : { capacity: integer(raw.capacity, "Table capacity", 0, 100) }),
    ...(raw.minPartySize === undefined
      ? {}
      : { minPartySize: integer(raw.minPartySize, "Minimum party size", 1, 100) }),
    ...(raw.maxPartySize === undefined
      ? {}
      : { maxPartySize: integer(raw.maxPartySize, "Maximum party size", 1, 100) }),
    ...(notes ? { notes } : {}),
    ...(color ? { color } : {}),
  };
  if (element.type === "TABLE") {
    if (!element.label.trim()) invalid("Every table needs a label.");
    if (!element.shape) invalid("Every table needs a shape.");
    if (!element.capacity || !element.maxPartySize) invalid("Every table needs a capacity.");
    if ((element.minPartySize ?? 1) > element.maxPartySize) {
      invalid("Minimum party size cannot exceed maximum party size.");
    }
  }
  return element;
}

export function validateFloorPlanMutation(input: unknown): FloorPlanMutationInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    invalid("Floor-plan input is invalid.");
  }
  const raw = input as Record<string, unknown>;
  const planId = text(raw.planId, "Floor plan ID", 80, true) as string;
  if (!UUID_PATTERN.test(planId)) invalid("Floor plan ID is invalid.");
  const name = text(raw.name, "Floor plan name", 120, true) as string;
  if (!Array.isArray(raw.elements) || raw.elements.length > 500) {
    invalid("A floor plan can contain up to 500 elements.");
  }
  const elements = raw.elements.map(parseElement);
  if (new Set(elements.map((element) => element.id)).size !== elements.length) {
    invalid("Floor element IDs must be unique.");
  }
  return {
    planId,
    name,
    elements,
    draftRevision: integer(raw.draftRevision, "Draft revision", 0, Number.MAX_SAFE_INTEGER),
  };
}

function scopedPlanWhere(scope: PrismaOperationsScope, planId: string) {
  return {
    id: planId,
    restaurantId: scope.restaurantId,
    restaurant: {
      is: {
        memberships: {
          some: {
            profileId: scope.profileId,
            active: true,
            role: { in: ["OWNER", "MANAGER"] },
          },
        },
      },
    },
  } satisfies Prisma.FloorPlanWhereInput;
}

function draftSnapshot(
  elements: FloorElement[],
  logicalWidth: number,
  logicalHeight: number,
): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify({ elements, logicalWidth, logicalHeight }),
  ) as Prisma.InputJsonValue;
}

function errorFromUnknown(error: unknown) {
  if (error instanceof OperationsRepositoryError) return error;
  return new OperationsRepositoryError(
    "PERSISTENCE",
    "Halina could not save the floor plan. Please try again.",
    { cause: error },
  );
}

export async function saveFloorPlanDraft(
  client: PrismaClient,
  scope: PrismaOperationsScope,
  rawInput: unknown,
) {
  const input = validateFloorPlanMutation(rawInput);
  try {
    await client.$transaction(async (transaction) => {
      const plan = await transaction.floorPlan.findFirst({
        where: scopedPlanWhere(scope, input.planId),
        select: { id: true, logicalWidth: true, logicalHeight: true, draftRevision: true },
      });
      if (!plan) {
        throw new OperationsRepositoryError("FORBIDDEN", "You cannot edit this floor plan.");
      }
      if (plan.draftRevision !== input.draftRevision) {
        throw new OperationsRepositoryError(
          "CONFLICT",
          "This floor plan was changed on another device. Refresh and try again.",
        );
      }
      const updated = await transaction.floorPlan.updateMany({
        where: { id: plan.id, restaurantId: scope.restaurantId, draftRevision: input.draftRevision },
        data: {
          name: input.name,
          draftRevision: { increment: 1 },
          draftSnapshot: draftSnapshot(
            input.elements,
            plan.logicalWidth,
            plan.logicalHeight,
          ),
        },
      });
      if (updated.count !== 1) {
        throw new OperationsRepositoryError(
          "CONFLICT",
          "This floor plan was changed on another device. Refresh and try again.",
        );
      }
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    throw errorFromUnknown(error);
  }
}

export async function publishFloorPlan(
  client: PrismaClient,
  scope: PrismaOperationsScope,
  rawInput: unknown,
) {
  const input = validateFloorPlanMutation(rawInput);
  try {
    await client.$transaction(async (transaction) => {
      const plan = await transaction.floorPlan.findFirst({
        where: scopedPlanWhere(scope, input.planId),
        select: {
          id: true,
          logicalWidth: true,
          logicalHeight: true,
          draftRevision: true,
          versions: { select: { version: true } },
        },
      });
      if (!plan) {
        throw new OperationsRepositoryError("FORBIDDEN", "You cannot publish this floor plan.");
      }
      if (plan.draftRevision !== input.draftRevision) {
        throw new OperationsRepositoryError(
          "CONFLICT",
          "This floor plan was changed on another device. Refresh and try again.",
        );
      }
      const validationErrors = validateFloor(
        input.elements,
        plan.logicalWidth,
        plan.logicalHeight,
      )
        .filter((issue) => issue.blocking)
        .map((issue) => issue.message);
      if (validationErrors.length) {
        throw new OperationsRepositoryError("VALIDATION", validationErrors.join(" "));
      }

      const tableElements = input.elements.filter((element) => element.type === "TABLE");
      const suppliedTableIds = tableElements
        .map((element) => element.tableId)
        .filter((id): id is string => Boolean(id && UUID_PATTERN.test(id)));
      const existingTables = await transaction.diningTable.findMany({
        where: { restaurantId: scope.restaurantId, id: { in: suppliedTableIds } },
      });
      const existingById = new Map(existingTables.map((table) => [table.id, table]));
      const canonicalTableIdByElementId = new Map<string, string>();

      for (const element of tableElements) {
        const existing = element.tableId ? existingById.get(element.tableId) : undefined;
        if (existing) {
          canonicalTableIdByElementId.set(element.id, existing.id);
          continue;
        }
        const created = await transaction.diningTable.create({
          data: {
            restaurantId: scope.restaurantId,
            label: element.label,
            capacity: element.capacity ?? 1,
            minPartySize: element.minPartySize ?? 1,
            maxPartySize: element.maxPartySize ?? element.capacity ?? 1,
            zone: element.zone ?? "Main dining",
            shape: element.shape ?? "SQUARE",
          },
        });
        canonicalTableIdByElementId.set(element.id, created.id);
      }

      const publishedTableIds = new Set(canonicalTableIdByElementId.values());
      const activeTables = await transaction.diningTable.findMany({
        where: { restaurantId: scope.restaurantId, active: true, archivedAt: null },
        select: { id: true, label: true, capacity: true },
      });
      const removedTableIds = activeTables
        .filter((table) => !publishedTableIds.has(table.id))
        .map((table) => table.id);
      const changedTableIds = tableElements
        .map((element) => canonicalTableIdByElementId.get(element.id) as string);
      const activeSessions = await transaction.diningSession.findMany({
        where: {
          restaurantId: scope.restaurantId,
          diningTableId: { in: [...new Set([...removedTableIds, ...changedTableIds])] },
          status: { in: ["ACTIVE", "CLEARED", "CLEANING"] },
        },
        select: { diningTableId: true, partySize: true },
      });
      const activeReservations = await transaction.reservation.findMany({
        where: {
          restaurantId: scope.restaurantId,
          assignedTableId: { in: [...new Set([...removedTableIds, ...changedTableIds])] },
          status: { in: ["CONFIRMED", "ARRIVED"] },
        },
        select: { assignedTableId: true, partySize: true },
      });
      const activePartySizeByTable = new Map<string, number>();
      for (const record of activeSessions) {
        const tableId = record.diningTableId;
        activePartySizeByTable.set(
          tableId,
          Math.max(activePartySizeByTable.get(tableId) ?? 0, record.partySize),
        );
      }
      for (const record of activeReservations) {
        if (!record.assignedTableId) continue;
        activePartySizeByTable.set(
          record.assignedTableId,
          Math.max(
            activePartySizeByTable.get(record.assignedTableId) ?? 0,
            record.partySize,
          ),
        );
      }
      for (const tableId of removedTableIds) {
        if (activePartySizeByTable.has(tableId)) {
          const table = activeTables.find((item) => item.id === tableId);
          throw new OperationsRepositoryError(
            "CONFLICT",
            `${table?.label ?? "A removed table"} has an active session or reservation.`,
          );
        }
      }
      for (const element of tableElements) {
        const tableId = canonicalTableIdByElementId.get(element.id) as string;
        const activePartySize = activePartySizeByTable.get(tableId) ?? 0;
        if ((element.capacity ?? 0) < activePartySize) {
          throw new OperationsRepositoryError(
            "CONFLICT",
            `${element.label} cannot be reduced below its active party size of ${activePartySize}.`,
          );
        }
      }

      for (const element of tableElements) {
        const tableId = canonicalTableIdByElementId.get(element.id) as string;
        await transaction.diningTable.update({
          where: { id: tableId },
          data: {
            label: element.label,
            capacity: element.capacity ?? 1,
            minPartySize: element.minPartySize ?? 1,
            maxPartySize: element.maxPartySize ?? element.capacity ?? 1,
            zone: element.zone ?? "Main dining",
            shape: element.shape ?? "SQUARE",
            active: true,
            archivedAt: null,
          },
        });
      }
      if (removedTableIds.length) {
        await transaction.diningTable.updateMany({
          where: { restaurantId: scope.restaurantId, id: { in: removedTableIds } },
          data: { active: false, archivedAt: new Date() },
        });
      }

      const canonicalElements = input.elements.map((element) => ({
        ...element,
        id: UUID_PATTERN.test(element.id) ? element.id : randomUUID(),
        ...(element.type === "TABLE"
          ? { tableId: canonicalTableIdByElementId.get(element.id) }
          : {}),
      }));
      const versionNumber = Math.max(0, ...plan.versions.map((version) => version.version)) + 1;
      const version = await transaction.floorPlanVersion.create({
        data: {
          floorPlanId: plan.id,
          version: versionNumber,
          name: input.name,
          logicalWidth: plan.logicalWidth,
          logicalHeight: plan.logicalHeight,
          createdById: scope.profileId,
          publishedById: scope.profileId,
          publishedAt: new Date(),
          elements: {
            create: canonicalElements.map((element) => ({
              stableElementId: element.id,
              diningTableId: element.type === "TABLE" ? element.tableId : null,
              type: element.type,
              x: element.x,
              y: element.y,
              width: element.width,
              height: element.height,
              rotation: element.rotation,
              zIndex: element.zIndex,
              locked: element.locked,
              visible: element.visible,
              label: element.label,
              zone: element.zone ?? null,
              shape: element.shape ?? null,
              properties: {
                capacity: element.capacity,
                minPartySize: element.minPartySize,
                maxPartySize: element.maxPartySize,
                notes: element.notes,
                color: element.color,
              },
            })),
          },
        },
      });
      const updated = await transaction.floorPlan.updateMany({
        where: { id: plan.id, restaurantId: scope.restaurantId, draftRevision: input.draftRevision },
        data: {
          name: input.name,
          activeVersionId: version.id,
          draftRevision: { increment: 1 },
          draftSnapshot: draftSnapshot(
            canonicalElements,
            plan.logicalWidth,
            plan.logicalHeight,
          ),
        },
      });
      if (updated.count !== 1) {
        throw new OperationsRepositoryError(
          "CONFLICT",
          "This floor plan was changed on another device. Refresh and try again.",
        );
      }
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    throw errorFromUnknown(error);
  }
}
