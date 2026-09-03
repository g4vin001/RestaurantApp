"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import {
  publishFloorPlan,
  restoreFloorVersion,
  saveFloorDraft,
} from "@/lib/domain/floor-plan";
import {
  addQueueEntry,
  addStaffMember,
  createReservation,
  correctLastTableTransition,
  moveReservationTable as moveReservationTableCommand,
  removeStaffMember,
  seatQueueEntry,
  seatReservation,
  setQueueStatus,
  setReservationStatus,
  setStaffActive,
  transitionTable as transitionTableCommand,
  updateQueueEntry,
  updateReservation,
  updateStaffMember,
  type QueueInput,
  type ReservationInput,
  type StaffInput,
} from "@/lib/domain/operations";
import type {
  DemoState,
  FloorElement,
  FloorPlan,
  RestaurantIdentity,
  TableStatus,
} from "@/lib/domain/types";
import { createDemoState } from "@/lib/demo/seed";
import {
  type OperationsRepositoryMode,
} from "@/lib/repositories/operations";
import {
  newCommandId,
  type CommandFailureCode,
  type DatabaseOperationsCommand,
} from "@/lib/repositories/commands";
import { loadManagerSnapshotAction, runManagerCommand } from "@/app/manager/actions";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  createFloorPlanAction,
  publishFloorPlanAction,
  restoreFloorPlanVersionAction,
  saveFloorPlanDraftAction,
} from "@/app/manager/floor/actions";

const STORAGE_KEY = "halina:demo-state:v2";
const LEGACY_STORAGE_KEY = "halina:demo-state:v1";
const CHANNEL_NAME = "halina:demo-state";

type DemoAction =
  | { type: "HYDRATE"; state: DemoState }
  | { type: "RESET"; state: DemoState }
  | { type: "REPLACE"; state: DemoState };

type CommandFeedback =
  | { ok: true; state?: DemoState }
  | { ok: false; error: string; code?: CommandFailureCode };

/** Options accepted by every command that puts a party on a table. */
export type SeatingOptions = { acknowledgeReservationClash?: boolean };

function reducer(_state: DemoState, action: DemoAction): DemoState {
  return action.state;
}

export function migrateDemoState(value: unknown): DemoState | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Omit<Partial<DemoState>, "version"> & {
    version?: number;
  };
  if (
    parsed.version === 2 &&
    parsed.restaurant &&
    parsed.tables &&
    parsed.floorPlans
  ) {
    const defaults = createDemoState(
      new Date(parsed.lastUpdatedAt ?? Date.now()),
    );
    return {
      ...defaults,
      ...parsed,
      version: 2,
      restaurant: {
        ...defaults.restaurant,
        ...parsed.restaurant,
        id: "salu-salo",
      },
    } as DemoState;
  }
  if (parsed.version === 1 && parsed.restaurant && parsed.tables) {
    const migrated = createDemoState(
      new Date(parsed.lastUpdatedAt ?? Date.now()),
    );
    return {
      ...migrated,
      restaurant: {
        ...migrated.restaurant,
        ...parsed.restaurant,
        id: "salu-salo",
      },
      tables: parsed.tables,
      queue: (parsed.queue ?? []).map((entry) => ({
        ...entry,
        updatedAt:
          "updatedAt" in entry && typeof entry.updatedAt === "string"
            ? entry.updatedAt
            : entry.joinedAt,
      })),
      sessions: parsed.sessions ?? [],
      events: parsed.events ?? [],
      reservations: (parsed.reservations ?? []).map((reservation) => ({
        ...reservation,
        updatedAt:
          "updatedAt" in reservation &&
          typeof reservation.updatedAt === "string"
            ? reservation.updatedAt
            : reservation.scheduledAt,
      })),
      lastUpdatedAt: parsed.lastUpdatedAt ?? migrated.lastUpdatedAt,
    };
  }
  return null;
}

interface DemoContextValue {
  mode: OperationsRepositoryMode;
  state: DemoState;
  hydrated: boolean;
  connectionStatus: "live" | "reconnecting" | "offline" | "stale";
  changedOnAnotherDevice: boolean;
  transitionTable: (
    tableId: string,
    status: TableStatus,
    partySize?: number,
    options?: SeatingOptions,
  ) => Promise<CommandFeedback>;
  correctTable: (tableId: string, reason: string) => Promise<CommandFeedback>;
  saveFloor: (
    planId: string,
    name: string,
    elements: FloorElement[],
  ) => Promise<CommandFeedback>;
  publishFloor: (
    planId: string,
    name: string,
    elements: FloorElement[],
  ) => Promise<CommandFeedback>;
  restoreFloor: (planId: string, versionId: string) => Promise<CommandFeedback>;
  createFloor: (name: string) => Promise<string | null>;
  addQueue: (input: QueueInput) => Promise<CommandFeedback>;
  updateQueue: (entryId: string, input: QueueInput) => Promise<CommandFeedback>;
  callQueue: (entryId: string) => Promise<CommandFeedback>;
  cancelQueue: (entryId: string) => Promise<CommandFeedback>;
  noShowQueue: (entryId: string) => Promise<CommandFeedback>;
  seatQueue: (
    entryId: string,
    tableIdOrIds: string | string[],
    options?: SeatingOptions,
  ) => Promise<CommandFeedback>;
  reorderQueue: (entryId: string, direction: -1 | 1) => Promise<CommandFeedback>;
  addReservation: (input: ReservationInput) => Promise<CommandFeedback>;
  updateReservationRecord: (
    reservationId: string,
    input: ReservationInput,
  ) => Promise<CommandFeedback>;
  changeReservationStatus: (
    reservationId: string,
    status:
      | "CONFIRMED"
      | "ARRIVED"
      | "CANCELLED"
      | "NO_SHOW"
      | "COMPLETED",
  ) => Promise<CommandFeedback>;
  seatReservationRecord: (
    reservationId: string,
    tableIdOrIds: string | string[],
    options?: SeatingOptions,
  ) => Promise<CommandFeedback>;
  moveReservationTable: (
    reservationId: string,
    tableIdOrIds: string | string[],
    options?: SeatingOptions,
  ) => Promise<CommandFeedback>;
  addStaff: (input: StaffInput) => Promise<CommandFeedback>;
  updateStaff: (staffId: string, input: StaffInput) => Promise<CommandFeedback>;
  setStaffStatus: (staffId: string, active: boolean) => Promise<CommandFeedback>;
  removeStaff: (staffId: string) => Promise<CommandFeedback>;
  updateRestaurant: (
    input: Pick<
      RestaurantIdentity,
      | "name"
      | "location"
      | "isOpen"
      | "cleaningTargetMinutes"
      | "opensAtHour"
      | "closesAtHour"
    >,
  ) => Promise<CommandFeedback>;
  reset: () => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function OperationsProvider({
  children,
  repositoryMode,
  initialState,
}: {
  children: ReactNode;
  repositoryMode: OperationsRepositoryMode;
  initialState?: DemoState;
}) {
  const [state, dispatch] = useReducer(
    reducer,
    initialState ?? createDemoState(),
  );
  const [hydrated, setHydrated] = useState(repositoryMode === "database");
  const [connectionStatus, setConnectionStatus] = useState<DemoContextValue["connectionStatus"]>("live");
  const [changedOnAnotherDevice, setChangedOnAnotherDevice] = useState(false);

  useEffect(() => {
    if (repositoryMode !== "demo") return;
    const stored =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (stored) {
      try {
        const migrated = migrateDemoState(JSON.parse(stored));
        if (migrated) dispatch({ type: "HYDRATE", state: migrated });
        else window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    }
    setHydrated(true);
  }, [repositoryMode]);

  useEffect(() => {
    if (repositoryMode !== "demo" || !hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(state);
    channel.close();
  }, [hydrated, repositoryMode, state]);

  useEffect(() => {
    if (repositoryMode !== "demo") return;
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<DemoState>) => {
      const migrated = migrateDemoState(event.data);
      if (migrated && migrated.lastUpdatedAt !== state.lastUpdatedAt) {
        dispatch({ type: "HYDRATE", state: migrated });
      }
    };
    return () => channel.close();
  }, [repositoryMode, state.lastUpdatedAt]);

  const refreshDatabaseSnapshot = useCallback(async (remoteChange = false) => {
    if (repositoryMode !== "database") return;
    if (!navigator.onLine) {
      setConnectionStatus("offline");
      return;
    }
    setConnectionStatus("reconnecting");
    const result = await loadManagerSnapshotAction();
    if (!result.ok) {
      setConnectionStatus("stale");
      return;
    }
    dispatch({ type: "REPLACE", state: result.state });
    setChangedOnAnotherDevice(remoteChange);
    setConnectionStatus("live");
  }, [repositoryMode]);

  useEffect(() => {
    if (repositoryMode !== "database") return;
    const offline = () => setConnectionStatus("offline");
    const online = () => void refreshDatabaseSnapshot(false);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);

    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`restaurant:${state.restaurant.id}`, { config: { private: true } })
      .on("broadcast", { event: "invalidated" }, () => {
        void refreshDatabaseSnapshot(true);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnectionStatus("live");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnectionStatus(navigator.onLine ? "reconnecting" : "offline");
        }
        if (status === "CLOSED" && navigator.onLine) setConnectionStatus("stale");
      });

    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      void supabase.removeChannel(channel);
    };
  }, [refreshDatabaseSnapshot, repositoryMode, state.restaurant.id]);

  const applyResult = useCallback(
    (result: {
      ok: boolean;
      state?: DemoState;
      error?: string;
      errors?: string[];
      code?: CommandFailureCode;
    }) => {
      if (!result.ok || !result.state) {
        return {
          ok: false,
          error:
            result.error ??
            result.errors?.join(" ") ??
            "That action could not be completed.",
          code: result.code,
        } as const;
      }
      dispatch({ type: "REPLACE", state: result.state });
      return { ok: true } as const;
    },
    [],
  );

  const runDatabaseCommand = useCallback(
    async (command: DatabaseOperationsCommand): Promise<CommandFeedback> => {
      if (!navigator.onLine) {
        setConnectionStatus("offline");
        return { ok: false, error: "You are offline. Reconnect before saving this change." };
      }
      const result = await runManagerCommand(command);
      if (!result.ok) {
        if (result.code === "CONFLICT") {
          await refreshDatabaseSnapshot(true);
        } else if (result.code === "PERSISTENCE") {
          setConnectionStatus("stale");
        }
        return { ok: false, error: result.error, code: result.code };
      }
      dispatch({ type: "REPLACE", state: result.state });
      return { ok: true, state: result.state };
    },
    [refreshDatabaseSnapshot],
  );

  const transitionTable = useCallback(
    async (
      tableId: string,
      status: TableStatus,
      partySize?: number,
      options: SeatingOptions = {},
    ) => {
      if (repositoryMode === "database") {
        const table = state.tables.find((item) => item.id === tableId);
        if (!table) return { ok: false, error: "Table was not found." };
        return runDatabaseCommand({
          type: "TRANSITION_TABLE",
          commandId: newCommandId(),
          tableId,
          expectedRevision: table.revision ?? 0,
          status,
          partySize,
          acknowledgeReservationClash: options.acknowledgeReservationClash,
        });
      }
      return applyResult(
        transitionTableCommand(
          state,
          tableId,
          status,
          new Date().toISOString(),
          "Demo manager",
          partySize,
          options,
        ),
      );
    },
    [applyResult, repositoryMode, runDatabaseCommand, state],
  );
  const correctTable = useCallback(
    async (tableId: string, reason: string) => {
      if (repositoryMode === "database") {
        const table = state.tables.find((item) => item.id === tableId);
        if (!table) return { ok: false, error: "Table was not found." };
        return runDatabaseCommand({
          type: "CORRECT_TABLE",
          commandId: newCommandId(),
          tableId,
          expectedRevision: table.revision ?? 0,
          reason,
        });
      }
      return applyResult(
        correctLastTableTransition(
          state,
          tableId,
          reason,
          new Date().toISOString(),
          "Demo manager",
        ),
      );
    },
    [applyResult, repositoryMode, runDatabaseCommand, state],
  );
  const saveFloor = useCallback(
    async (planId: string, name: string, elements: FloorElement[]) => {
      if (repositoryMode === "demo") {
        return applyResult(
          saveFloorDraft(state, planId, name, elements, new Date().toISOString()),
        );
      }
      const plan = state.floorPlans.find((item) => item.id === planId);
      if (!plan) return { ok: false, error: "Floor plan was not found." } as const;
      const result = await saveFloorPlanDraftAction({
        commandId: newCommandId(),
        planId,
        name,
        elements,
        draftRevision: plan.draft.baseVersion,
      });
      if (!result.ok) return result;
      dispatch({ type: "REPLACE", state: result.state });
      return { ok: true, state: result.state } as const;
    },
    [applyResult, repositoryMode, state],
  );
  const publishFloor = useCallback(
    async (planId: string, name: string, elements: FloorElement[]) => {
      if (repositoryMode === "demo") {
        return applyResult(
          publishFloorPlan(
            state,
            planId,
            name,
            elements,
            new Date().toISOString(),
            "Demo manager",
          ),
        );
      }
      const plan = state.floorPlans.find((item) => item.id === planId);
      if (!plan) return { ok: false, error: "Floor plan was not found." } as const;
      const result = await publishFloorPlanAction({
        commandId: newCommandId(),
        planId,
        name,
        elements,
        draftRevision: plan.draft.baseVersion,
      });
      if (!result.ok) return result;
      dispatch({ type: "REPLACE", state: result.state });
      return { ok: true, state: result.state } as const;
    },
    [applyResult, repositoryMode, state],
  );
  const restoreFloor = useCallback(
    async (planId: string, versionId: string): Promise<CommandFeedback> => {
      if (repositoryMode === "database") {
        const plan = state.floorPlans.find((item) => item.id === planId);
        if (!plan) return { ok: false, error: "Floor plan was not found." } as const;
        const result = await restoreFloorPlanVersionAction({
          commandId: newCommandId(),
          planId,
          versionId,
          expectedRevision: plan.draft.baseVersion,
        });
        if (!result.ok) return result;
        dispatch({ type: "REPLACE", state: result.state });
        return { ok: true, state: result.state } as const;
      }
      return applyResult(
        restoreFloorVersion(state, planId, versionId, new Date().toISOString()),
      );
    },
    [applyResult, repositoryMode, state],
  );
  const createFloor = useCallback(
    async (name: string) => {
      if (repositoryMode === "database") {
        const result = await createFloorPlanAction(name, newCommandId());
        if (!result.ok) return null;
        dispatch({ type: "REPLACE", state: result.state });
        return result.planId;
      }
      const occurredAt = new Date().toISOString();
      const id = `floor-${occurredAt}`;
      const plan: FloorPlan = {
        id,
        name: name.trim() || "Untitled floor",
        draft: {
          elements: [],
          logicalWidth: 1600,
          logicalHeight: 1000,
          savedAt: occurredAt,
          baseVersion: 0,
        },
        versions: [],
        activeVersionId: null,
        updatedAt: occurredAt,
      };
      dispatch({
        type: "REPLACE",
        state: {
          ...state,
          floorPlans: [...state.floorPlans, plan],
          lastUpdatedAt: occurredAt,
        },
      });
      return id;
    },
    [repositoryMode, state],
  );

  const addQueue = useCallback(
    async (input: QueueInput) =>
      repositoryMode === "database"
        ? runDatabaseCommand({ type: "ADD_QUEUE", commandId: newCommandId(), input })
        : applyResult(addQueueEntry(state, input, new Date().toISOString())),
    [applyResult, repositoryMode, runDatabaseCommand, state],
  );
  const updateQueue = useCallback(
    async (entryId: string, input: QueueInput) => {
      if (repositoryMode === "database") {
        const entry = state.queue.find((item) => item.id === entryId);
        if (!entry) return { ok: false, error: "Queue entry was not found." };
        return runDatabaseCommand({ type: "UPDATE_QUEUE", commandId: newCommandId(), entryId, expectedRevision: entry.revision ?? 0, input });
      }
      return applyResult(updateQueueEntry(state, entryId, input, new Date().toISOString()));
    },
    [applyResult, repositoryMode, runDatabaseCommand, state],
  );
  const queueStatus = useCallback(
    async (entryId: string, status: "CALLED" | "CANCELLED" | "NO_SHOW") => {
      if (repositoryMode === "database") {
        const entry = state.queue.find((item) => item.id === entryId);
        if (!entry) return { ok: false, error: "Queue entry was not found." };
        return runDatabaseCommand({ type: "SET_QUEUE_STATUS", commandId: newCommandId(), entryId, expectedRevision: entry.revision ?? 0, status });
      }
      return applyResult(setQueueStatus(state, entryId, status, new Date().toISOString()));
    },
    [applyResult, repositoryMode, runDatabaseCommand, state],
  );
  const seatQueue = useCallback(
    async (
      entryId: string,
      tableIdOrIds: string | string[],
      options: SeatingOptions = {},
    ) => {
      if (repositoryMode === "database") {
        const entry = state.queue.find((item) => item.id === entryId);
        if (!entry) return { ok: false, error: "Queue entry was not found." };
        return runDatabaseCommand({
          type: "SEAT_QUEUE",
          commandId: newCommandId(),
          entryId,
          expectedRevision: entry.revision ?? 0,
          tableIds: Array.isArray(tableIdOrIds) ? tableIdOrIds : [tableIdOrIds],
          acknowledgeReservationClash: options.acknowledgeReservationClash,
        });
      }
      return applyResult(seatQueueEntry(
          state,
          entryId,
          tableIdOrIds,
          new Date().toISOString(),
          "Demo manager",
          options,
        ));
    },
    [applyResult, repositoryMode, runDatabaseCommand, state],
  );
  const reorderQueue = useCallback(
    async (entryId: string, direction: -1 | 1): Promise<CommandFeedback> => {
      if (repositoryMode === "database") {
        const entry = state.queue.find((item) => item.id === entryId);
        if (!entry) return { ok: false, error: "Queue entry was not found." };
        return runDatabaseCommand({ type: "REORDER_QUEUE", commandId: newCommandId(), entryId, expectedRevision: entry.revision ?? 0, direction });
      }
      const active = state.queue.filter((entry) =>
        ["WAITING", "CALLED"].includes(entry.status),
      );
      const index = active.findIndex((entry) => entry.id === entryId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= active.length)
        return {
          ok: false,
          error: "That party is already at the edge of the queue.",
        };
      [active[index], active[nextIndex]] = [active[nextIndex], active[index]];
      const resolved = state.queue.filter(
        (entry) => !["WAITING", "CALLED"].includes(entry.status),
      );
      const occurredAt = new Date().toISOString();
      dispatch({
        type: "REPLACE",
        state: {
          ...state,
          queue: [...active, ...resolved],
          lastUpdatedAt: occurredAt,
        },
      });
      return { ok: true };
    },
    [repositoryMode, runDatabaseCommand, state],
  );

  const addReservation = useCallback(
    async (input: ReservationInput) =>
      repositoryMode === "database"
        ? runDatabaseCommand({ type: "ADD_RESERVATION", commandId: newCommandId(), input })
        : applyResult(createReservation(state, input, new Date().toISOString())),
    [applyResult, repositoryMode, runDatabaseCommand, state],
  );
  const updateReservationRecord = useCallback(
    async (reservationId: string, input: ReservationInput) => {
      if (repositoryMode === "database") {
        const reservation = state.reservations.find((item) => item.id === reservationId);
        if (!reservation) return { ok: false, error: "Reservation was not found." };
        return runDatabaseCommand({ type: "UPDATE_RESERVATION", commandId: newCommandId(), reservationId, expectedRevision: reservation.revision ?? 0, input });
      }
      return applyResult(updateReservation(
          state,
          reservationId,
          input,
          new Date().toISOString(),
        ));
    },
    [applyResult, repositoryMode, runDatabaseCommand, state],
  );
  const changeReservationStatus = useCallback(
    (
      reservationId: string,
      status:
        | "CONFIRMED"
        | "ARRIVED"
        | "CANCELLED"
        | "NO_SHOW"
        | "COMPLETED",
    ) => {
      if (repositoryMode === "database") {
        const reservation = state.reservations.find((item) => item.id === reservationId);
        if (!reservation) return Promise.resolve({ ok: false, error: "Reservation was not found." } as const);
        return runDatabaseCommand({ type: "SET_RESERVATION_STATUS", commandId: newCommandId(), reservationId, expectedRevision: reservation.revision ?? 0, status });
      }
      return Promise.resolve(applyResult(setReservationStatus(
          state,
          reservationId,
          status,
          new Date().toISOString(),
        )));
    },
    [applyResult, repositoryMode, runDatabaseCommand, state],
  );
  const seatReservationRecord = useCallback(
    async (
      reservationId: string,
      tableIdOrIds: string | string[],
      options: SeatingOptions = {},
    ) => {
      if (repositoryMode === "database") {
        const reservation = state.reservations.find((item) => item.id === reservationId);
        if (!reservation) return { ok: false, error: "Reservation was not found." };
        return runDatabaseCommand({ type: "SEAT_RESERVATION", commandId: newCommandId(), reservationId, expectedRevision: reservation.revision ?? 0, tableIds: Array.isArray(tableIdOrIds) ? tableIdOrIds : [tableIdOrIds], acknowledgeReservationClash: options.acknowledgeReservationClash });
      }
      return applyResult(seatReservation(
          state,
          reservationId,
          tableIdOrIds,
          new Date().toISOString(),
          "Demo manager",
          options,
        ));
    },
    [applyResult, repositoryMode, runDatabaseCommand, state],
  );
  const moveReservationTable = useCallback(
    async (
      reservationId: string,
      tableIdOrIds: string | string[],
      options: SeatingOptions = {},
    ) => {
      if (repositoryMode === "database") {
        const reservation = state.reservations.find((item) => item.id === reservationId);
        if (!reservation) return { ok: false, error: "Reservation was not found." };
        return runDatabaseCommand({
          type: "MOVE_RESERVATION_TABLE",
          commandId: newCommandId(),
          reservationId,
          expectedRevision: reservation.revision ?? 0,
          tableIds: Array.isArray(tableIdOrIds) ? tableIdOrIds : [tableIdOrIds],
          acknowledgeReservationClash: options.acknowledgeReservationClash,
        });
      }
      return applyResult(moveReservationTableCommand(
          state,
          reservationId,
          tableIdOrIds,
          new Date().toISOString(),
          "Demo manager",
          options,
        ));
    },
    [applyResult, repositoryMode, runDatabaseCommand, state],
  );
  const addStaff = useCallback(
    async (input: StaffInput) =>
      repositoryMode === "database"
        ? runDatabaseCommand({ type: "ADD_STAFF", commandId: newCommandId(), input })
        : applyResult(addStaffMember(state, input, new Date().toISOString())),
    [applyResult, repositoryMode, runDatabaseCommand, state],
  );
  const updateStaff = useCallback(
    async (staffId: string, input: StaffInput) => {
      if (repositoryMode === "database") {
        const staff = state.staff.find((item) => item.id === staffId);
        if (!staff) return { ok: false, error: "Staff record was not found." };
        return runDatabaseCommand({ type: "UPDATE_STAFF", commandId: newCommandId(), staffId, expectedRevision: staff.revision ?? 0, input });
      }
      return applyResult(updateStaffMember(state, staffId, input, new Date().toISOString()));
    },
    [applyResult, repositoryMode, runDatabaseCommand, state],
  );
  const setStaffStatus = useCallback(
    async (staffId: string, active: boolean) => {
      if (repositoryMode === "database") {
        const staff = state.staff.find((item) => item.id === staffId);
        if (!staff) return { ok: false, error: "Staff record was not found." };
        return runDatabaseCommand({ type: "SET_STAFF_ACTIVE", commandId: newCommandId(), staffId, expectedRevision: staff.revision ?? 0, active });
      }
      return applyResult(setStaffActive(state, staffId, active, new Date().toISOString()));
    },
    [applyResult, repositoryMode, runDatabaseCommand, state],
  );
  const removeStaff = useCallback(
    async (staffId: string) => {
      if (repositoryMode === "database") {
        const staff = state.staff.find((item) => item.id === staffId);
        if (!staff) return { ok: false, error: "Staff record was not found." };
        return runDatabaseCommand({ type: "ARCHIVE_STAFF", commandId: newCommandId(), staffId, expectedRevision: staff.revision ?? 0 });
      }
      return applyResult(removeStaffMember(state, staffId, new Date().toISOString()));
    },
    [applyResult, repositoryMode, runDatabaseCommand, state],
  );
  const updateRestaurant = useCallback(
    (
      input: Pick<
        RestaurantIdentity,
        | "name"
        | "location"
        | "isOpen"
        | "cleaningTargetMinutes"
        | "opensAtHour"
        | "closesAtHour"
      >,
    ): Promise<CommandFeedback> => {
      if (repositoryMode === "database") {
        return runDatabaseCommand({ type: "UPDATE_RESTAURANT", commandId: newCommandId(), expectedRevision: state.restaurant.revision ?? 0, input });
      }
      const name = input.name.trim();
      const location = input.location.trim();
      if (!name || !location)
        return Promise.resolve({
          ok: false,
          error: "Restaurant name and location are required.",
        });
      if (
        input.opensAtHour < 0 ||
        input.opensAtHour > 23 ||
        input.closesAtHour < 1 ||
        input.closesAtHour > 24
      ) {
        return Promise.resolve({ ok: false, error: "Opening and closing hours must be valid." });
      }
      if (input.closesAtHour <= input.opensAtHour) {
        return Promise.resolve({ ok: false, error: "Closing time must be after opening time." });
      }
      if (
        input.cleaningTargetMinutes < 1 ||
        input.cleaningTargetMinutes > 120
      ) {
        return Promise.resolve({
          ok: false,
          error: "Cleaning target must be between 1 and 120 minutes.",
        });
      }
      const occurredAt = new Date().toISOString();
      dispatch({
        type: "REPLACE",
        state: {
          ...state,
          restaurant: { ...state.restaurant, ...input, name, location },
          lastUpdatedAt: occurredAt,
        },
      });
      return Promise.resolve({ ok: true });
    },
    [repositoryMode, runDatabaseCommand, state],
  );
  const reset = useCallback(
    () => {
      if (repositoryMode === "demo") {
        dispatch({ type: "RESET", state: createDemoState() });
      }
    },
    [repositoryMode],
  );

  const value = useMemo<DemoContextValue>(
    () => ({
      mode: repositoryMode,
      state,
      hydrated,
      connectionStatus,
      changedOnAnotherDevice,
      transitionTable,
      correctTable,
      saveFloor,
      publishFloor,
      restoreFloor,
      createFloor,
      addQueue,
      updateQueue,
      callQueue: (entryId) => queueStatus(entryId, "CALLED"),
      cancelQueue: (entryId) => queueStatus(entryId, "CANCELLED"),
      noShowQueue: (entryId) => queueStatus(entryId, "NO_SHOW"),
      seatQueue,
      reorderQueue,
      addReservation,
      updateReservationRecord,
      changeReservationStatus,
      seatReservationRecord,
      moveReservationTable,
      addStaff,
      updateStaff,
      setStaffStatus,
      removeStaff,
      updateRestaurant,
      reset,
    }),
    [
      state,
      repositoryMode,
      hydrated,
      connectionStatus,
      changedOnAnotherDevice,
      transitionTable,
      correctTable,
      saveFloor,
      publishFloor,
      restoreFloor,
      createFloor,
      addQueue,
      updateQueue,
      queueStatus,
      seatQueue,
      reorderQueue,
      addReservation,
      updateReservationRecord,
      changeReservationStatus,
      seatReservationRecord,
      moveReservationTable,
      addStaff,
      updateStaff,
      setStaffStatus,
      removeStaff,
      updateRestaurant,
      reset,
    ],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function DemoProvider({ children }: { children: ReactNode }) {
  return (
    <OperationsProvider repositoryMode="demo">{children}</OperationsProvider>
  );
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) throw new Error("useDemo must be used inside DemoProvider");
  return context;
}
