import type {
  DemoState,
  DiningTable,
  FloorElement,
  FloorPlan,
  FloorPlanVersion,
} from "@/lib/domain/types";

export const FLOOR_WIDTH = 1600;
export const FLOOR_HEIGHT = 1000;
export const HISTORY_LIMIT = 40;

export interface FloorValidationIssue {
  code:
    | "OUTSIDE"
    | "OVERLAP"
    | "ZERO_CAPACITY"
    | "DUPLICATE_LABEL"
    | "NO_ENTRANCE"
    | "NO_HOST";
  message: string;
  elementIds: string[];
  blocking: boolean;
}

export interface FloorCommandResult {
  ok: boolean;
  state?: DemoState;
  errors?: string[];
}

function rectanglesOverlap(a: FloorElement, b: FloorElement) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function validateFloor(
  elements: FloorElement[],
  width = FLOOR_WIDTH,
  height = FLOOR_HEIGHT,
) {
  const issues: FloorValidationIssue[] = [];
  const visible = elements.filter((element) => element.visible);
  const tables = visible.filter((element) => element.type === "TABLE");

  for (const element of visible) {
    if (
      element.x < 0 ||
      element.y < 0 ||
      element.x + element.width > width ||
      element.y + element.height > height
    ) {
      issues.push({
        code: "OUTSIDE",
        message: `${element.label} extends outside the floor.`,
        elementIds: [element.id],
        blocking: false,
      });
    }
    if (element.type === "TABLE" && (element.capacity ?? 0) <= 0) {
      issues.push({
        code: "ZERO_CAPACITY",
        message: `${element.label} needs at least one seat.`,
        elementIds: [element.id],
        blocking: true,
      });
    }
  }

  const labels = new Map<string, FloorElement[]>();
  for (const table of tables) {
    const key = table.label.trim().toLocaleLowerCase("en-PH");
    labels.set(key, [...(labels.get(key) ?? []), table]);
  }
  for (const [label, duplicates] of labels) {
    if (label && duplicates.length > 1) {
      issues.push({
        code: "DUPLICATE_LABEL",
        message: `Active table label “${duplicates[0].label}” is duplicated.`,
        elementIds: duplicates.map((item) => item.id),
        blocking: true,
      });
    }
  }

  for (let index = 0; index < tables.length; index += 1) {
    for (let other = index + 1; other < tables.length; other += 1) {
      if (rectanglesOverlap(tables[index], tables[other])) {
        issues.push({
          code: "OVERLAP",
          message: `${tables[index].label} overlaps ${tables[other].label}.`,
          elementIds: [tables[index].id, tables[other].id],
          blocking: false,
        });
      }
    }
  }

  if (!visible.some((element) => element.type === "DOOR")) {
    issues.push({
      code: "NO_ENTRANCE",
      message: "Add an entrance door before publishing.",
      elementIds: [],
      blocking: false,
    });
  }
  if (!visible.some((element) => element.type === "HOST_STAND")) {
    issues.push({
      code: "NO_HOST",
      message: "Add a host stand before publishing.",
      elementIds: [],
      blocking: false,
    });
  }
  return issues;
}

/** Every floor with a published layout, in floor order. All of them are live. */
export function getLiveFloors(state: DemoState) {
  return state.floorPlans.flatMap((plan) => {
    const version = plan.versions.find((item) => item.id === plan.activeVersionId);
    return version ? [{ id: plan.id, name: plan.name, version }] : [];
  });
}

export function getActiveFloorVersion(state: DemoState) {
  const plan = state.floorPlans.find(
    (item) => item.id === state.activeFloorPlanId,
  );
  if (!plan?.activeVersionId) return null;
  return (
    plan.versions.find((version) => version.id === plan.activeVersionId) ?? null
  );
}

export function saveFloorDraft(
  state: DemoState,
  planId: string,
  name: string,
  elements: FloorElement[],
  occurredAt: string,
): FloorCommandResult {
  const plan = state.floorPlans.find((item) => item.id === planId);
  if (!plan) return { ok: false, errors: ["Floor plan was not found."] };
  const trimmedName = name.trim();
  if (!trimmedName)
    return { ok: false, errors: ["Floor plan name is required."] };

  return {
    ok: true,
    state: {
      ...state,
      floorPlans: state.floorPlans.map((item) =>
        item.id === planId
          ? {
              ...item,
              name: trimmedName,
              draft: {
                ...item.draft,
                elements: structuredClone(elements),
                savedAt: occurredAt,
              },
              updatedAt: occurredAt,
            }
          : item,
      ),
      lastUpdatedAt: occurredAt,
    },
  };
}

/**
 * Tables on the other live floors, keyed by id, with the floor's name. Several
 * floors can be live at once; a floor owns every active table not listed here,
 * which for a single-floor restaurant is every active table.
 */
export function tablesOnOtherLiveFloors(state: DemoState, planId: string) {
  const owners = new Map<string, string>();
  for (const plan of state.floorPlans) {
    if (plan.id === planId || !plan.activeVersionId) continue;
    const version = plan.versions.find((item) => item.id === plan.activeVersionId);
    for (const element of version?.elements ?? []) {
      if (element.type !== "TABLE" || !element.tableId) continue;
      if (state.tables.some((table) => table.id === element.tableId && table.active)) {
        owners.set(element.tableId, plan.name);
      }
    }
  }
  return owners;
}

function publishConflicts(state: DemoState, planId: string, elements: FloorElement[]) {
  const nextTables = elements.filter(
    (element) => element.type === "TABLE" && element.tableId,
  );
  const nextTableIds = new Set(nextTables.map((element) => element.tableId));
  const otherFloors = tablesOnOtherLiveFloors(state, planId);
  const removed = state.tables
    .filter((table) => table.active && !nextTableIds.has(table.id) && !otherFloors.has(table.id))
    .map((table) => table.id);
  const conflicts: string[] = [];

  // Labels identify tables everywhere (queue, reservations, staff), so they
  // must be unique across live floors.
  const otherLabels = new Map(
    [...otherFloors].map(([tableId, floorName]) => [
      state.tables.find((table) => table.id === tableId)?.label.trim().toLocaleLowerCase("en"),
      floorName,
    ]),
  );
  for (const element of elements.filter((item) => item.type === "TABLE")) {
    const takenBy =
      (element.tableId ? otherFloors.get(element.tableId) : undefined) ??
      otherLabels.get(element.label.trim().toLocaleLowerCase("en"));
    if (takenBy) {
      conflicts.push(`${element.label} is already a table on ${takenBy}. Table labels must be unique across floors.`);
    }
  }

  for (const tableId of removed) {
    const table = state.tables.find((item) => item.id === tableId);
    const activeSession = state.sessions.some(
      (session) => session.tableId === tableId && !session.clearedAt,
    );
    const activeReservation = state.reservations.some(
      (reservation) =>
        reservation.tableId === tableId &&
        ["CONFIRMED", "ARRIVED"].includes(reservation.status),
    );
    if (activeSession || activeReservation) {
      conflicts.push(
        `${table?.label ?? "A removed table"} has an active session or reservation.`,
      );
    }
  }
  for (const element of nextTables) {
    const tableId = element.tableId as string;
    const largestActiveParty = Math.max(
      0,
      ...state.sessions
        .filter((session) => session.tableId === tableId && !session.clearedAt)
        .map((session) => session.partySize),
      ...state.reservations
        .filter(
          (reservation) =>
            reservation.tableId === tableId &&
            ["CONFIRMED", "ARRIVED"].includes(reservation.status),
        )
        .map((reservation) => reservation.partySize),
    );
    if ((element.capacity ?? 0) < largestActiveParty) {
      conflicts.push(
        `${element.label} cannot be reduced below its active party size of ${largestActiveParty}.`,
      );
    }
  }
  return conflicts;
}

export function publishFloorPlan(
  state: DemoState,
  planId: string,
  name: string,
  elements: FloorElement[],
  occurredAt: string,
  actor: string,
): FloorCommandResult {
  const plan = state.floorPlans.find((item) => item.id === planId);
  if (!plan) return { ok: false, errors: ["Floor plan was not found."] };
  const blocking = validateFloor(
    elements,
    plan.draft.logicalWidth,
    plan.draft.logicalHeight,
  )
    .filter((issue) => issue.blocking)
    .map((issue) => issue.message);
  const conflicts = publishConflicts(state, planId, elements);
  const errors = [...blocking, ...conflicts];
  if (errors.length) return { ok: false, errors };

  const versionNumber =
    Math.max(0, ...plan.versions.map((version) => version.version)) + 1;
  const version: FloorPlanVersion = {
    id: `${plan.id}-v${versionNumber}`,
    version: versionNumber,
    name: name.trim() || plan.name,
    elements: structuredClone(elements),
    logicalWidth: plan.draft.logicalWidth,
    logicalHeight: plan.draft.logicalHeight,
    publishedAt: occurredAt,
    publishedBy: actor,
  };
  const elementTables = elements.filter(
    (element) => element.type === "TABLE" && element.tableId,
  );
  const publishedTableIds = new Set(
    elementTables.map((element) => element.tableId as string),
  );
  const existingById = new Map(state.tables.map((table) => [table.id, table]));
  const publishedTables: DiningTable[] = elementTables.map((element) => {
    const tableId = element.tableId as string;
    const existing = existingById.get(tableId);
    return {
      id: tableId,
      label: element.label,
      capacity: element.capacity ?? 2,
      zone: element.zone ?? "Main dining",
      status: existing?.status ?? "AVAILABLE",
      statusChangedAt: existing?.statusChangedAt ?? occurredAt,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      rotation: element.rotation,
      shape: element.shape ?? "SQUARE",
      active: true,
    };
  });
  const otherFloors = tablesOnOtherLiveFloors(state, planId);
  // Other live floors keep their tables untouched; only this floor's own
  // dropped tables are retired.
  const keptTables = state.tables.filter(
    (table) => !publishedTableIds.has(table.id) && otherFloors.has(table.id),
  );
  const archivedTables = state.tables
    .filter((table) => !publishedTableIds.has(table.id) && !otherFloors.has(table.id))
    .map((table) => ({ ...table, active: false }));
  const updatedPlan: FloorPlan = {
    ...plan,
    name: version.name,
    activeVersionId: version.id,
    versions: [...plan.versions, version],
    draft: {
      ...plan.draft,
      elements: structuredClone(elements),
      savedAt: occurredAt,
      baseVersion: versionNumber,
    },
    updatedAt: occurredAt,
  };

  return {
    ok: true,
    state: {
      ...state,
      tables: [...publishedTables, ...keptTables, ...archivedTables],
      floorPlans: state.floorPlans.map((item) =>
        item.id === planId ? updatedPlan : item,
      ),
      activeFloorPlanId: planId,
      lastUpdatedAt: occurredAt,
    },
  };
}

export function restoreFloorVersion(
  state: DemoState,
  planId: string,
  versionId: string,
  occurredAt: string,
): FloorCommandResult {
  const plan = state.floorPlans.find((item) => item.id === planId);
  const version = plan?.versions.find((item) => item.id === versionId);
  if (!plan || !version)
    return { ok: false, errors: ["Published version was not found."] };
  return saveFloorDraft(
    state,
    planId,
    `${version.name} restored`,
    version.elements,
    occurredAt,
  );
}

/** Demo-mode counterpart of the database archiveFloorPlan command. */
export function deleteFloorPlan(state: DemoState, planId: string): FloorCommandResult {
  const plan = state.floorPlans.find((item) => item.id === planId);
  if (!plan) return { ok: false, errors: ["Floor plan was not found."] };
  if (state.floorPlans.length < 2) {
    return { ok: false, errors: ["A restaurant needs at least one floor. Create another floor before deleting this one."] };
  }
  const version = plan.versions.find((item) => item.id === plan.activeVersionId);
  const tableIds = new Set(
    (version?.elements ?? [])
      .filter((element) => element.type === "TABLE" && element.tableId)
      .map((element) => element.tableId as string),
  );
  const tables = state.tables.filter((table) => table.active && tableIds.has(table.id));
  const busy = tables.filter(
    (table) =>
      ["HELD", "RESERVED", "OCCUPIED", "CLEANING"].includes(table.status) ||
      state.sessions.some((session) => session.tableId === table.id && !session.readyAt) ||
      state.reservations.some(
        (reservation) =>
          (reservation.tableId === table.id || reservation.tableIds?.includes(table.id)) &&
          ["PENDING_APPROVAL", "CONFIRMED", "ARRIVED"].includes(reservation.status),
      ),
  );
  if (busy.length) {
    return {
      ok: false,
      errors: [`${plan.name} still has tables in use or booked (${busy.map((table) => table.label).join(", ")}). Clear them or move their reservations, then delete the floor.`],
    };
  }
  const floorPlans = state.floorPlans.filter((item) => item.id !== planId);
  return {
    ok: true,
    state: {
      ...state,
      floorPlans,
      tables: state.tables.map((table) => (tableIds.has(table.id) ? { ...table, active: false } : table)),
      activeFloorPlanId: state.activeFloorPlanId === planId ? floorPlans[0].id : state.activeFloorPlanId,
    },
  };
}
