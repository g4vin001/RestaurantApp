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

const STORAGE_KEY = "halina:demo-state:v2";
const LEGACY_STORAGE_KEY = "halina:demo-state:v1";
const CHANNEL_NAME = "halina:demo-state";

type DemoAction =
  | { type: "HYDRATE"; state: DemoState }
  | { type: "RESET"; state: DemoState }
  | { type: "REPLACE"; state: DemoState };

type CommandFeedback = { ok: true } | { ok: false; error: string };

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
  state: DemoState;
  hydrated: boolean;
  transitionTable: (
    tableId: string,
    status: TableStatus,
    partySize?: number,
  ) => CommandFeedback;
  saveFloor: (
    planId: string,
    name: string,
    elements: FloorElement[],
  ) => CommandFeedback;
  publishFloor: (
    planId: string,
    name: string,
    elements: FloorElement[],
  ) => CommandFeedback;
  restoreFloor: (planId: string, versionId: string) => CommandFeedback;
  createFloor: (name: string) => string;
  addQueue: (input: QueueInput) => CommandFeedback;
  updateQueue: (entryId: string, input: QueueInput) => CommandFeedback;
  callQueue: (entryId: string) => CommandFeedback;
  cancelQueue: (entryId: string) => CommandFeedback;
  noShowQueue: (entryId: string) => CommandFeedback;
  seatQueue: (entryId: string, tableId: string) => CommandFeedback;
  reorderQueue: (entryId: string, direction: -1 | 1) => CommandFeedback;
  addReservation: (input: ReservationInput) => CommandFeedback;
  updateReservationRecord: (
    reservationId: string,
    input: ReservationInput,
  ) => CommandFeedback;
  changeReservationStatus: (
    reservationId: string,
    status: "ARRIVED" | "CANCELLED" | "NO_SHOW" | "COMPLETED",
  ) => CommandFeedback;
  seatReservationRecord: (
    reservationId: string,
    tableId: string,
  ) => CommandFeedback;
  addStaff: (input: StaffInput) => CommandFeedback;
  updateStaff: (staffId: string, input: StaffInput) => CommandFeedback;
  setStaffStatus: (staffId: string, active: boolean) => CommandFeedback;
  removeStaff: (staffId: string) => CommandFeedback;
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
  ) => CommandFeedback;
  reset: () => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    createDemoState(),
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(state);
    channel.close();
  }, [hydrated, state]);

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<DemoState>) => {
      const migrated = migrateDemoState(event.data);
      if (migrated && migrated.lastUpdatedAt !== state.lastUpdatedAt) {
        dispatch({ type: "HYDRATE", state: migrated });
      }
    };
    return () => channel.close();
  }, [state.lastUpdatedAt]);

  const applyResult = useCallback(
    (result: {
      ok: boolean;
      state?: DemoState;
      error?: string;
      errors?: string[];
    }) => {
      if (!result.ok || !result.state) {
        return {
          ok: false,
          error:
            result.error ??
            result.errors?.join(" ") ??
            "That action could not be completed.",
        } as const;
      }
      dispatch({ type: "REPLACE", state: result.state });
      return { ok: true } as const;
    },
    [],
  );

  const transitionTable = useCallback(
    (tableId: string, status: TableStatus, partySize?: number) =>
      applyResult(
        transitionTableCommand(
          state,
          tableId,
          status,
          new Date().toISOString(),
          "Demo manager",
          partySize,
        ),
      ),
    [applyResult, state],
  );
  const saveFloor = useCallback(
    (planId: string, name: string, elements: FloorElement[]) =>
      applyResult(
        saveFloorDraft(state, planId, name, elements, new Date().toISOString()),
      ),
    [applyResult, state],
  );
  const publishFloor = useCallback(
    (planId: string, name: string, elements: FloorElement[]) =>
      applyResult(
        publishFloorPlan(
          state,
          planId,
          name,
          elements,
          new Date().toISOString(),
          "Demo manager",
        ),
      ),
    [applyResult, state],
  );
  const restoreFloor = useCallback(
    (planId: string, versionId: string) =>
      applyResult(
        restoreFloorVersion(state, planId, versionId, new Date().toISOString()),
      ),
    [applyResult, state],
  );
  const createFloor = useCallback(
    (name: string) => {
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
    [state],
  );

  const addQueue = useCallback(
    (input: QueueInput) =>
      applyResult(addQueueEntry(state, input, new Date().toISOString())),
    [applyResult, state],
  );
  const updateQueue = useCallback(
    (entryId: string, input: QueueInput) =>
      applyResult(
        updateQueueEntry(state, entryId, input, new Date().toISOString()),
      ),
    [applyResult, state],
  );
  const queueStatus = useCallback(
    (entryId: string, status: "CALLED" | "CANCELLED" | "NO_SHOW") =>
      applyResult(
        setQueueStatus(state, entryId, status, new Date().toISOString()),
      ),
    [applyResult, state],
  );
  const seatQueue = useCallback(
    (entryId: string, tableId: string) =>
      applyResult(
        seatQueueEntry(
          state,
          entryId,
          tableId,
          new Date().toISOString(),
          "Demo manager",
        ),
      ),
    [applyResult, state],
  );
  const reorderQueue = useCallback(
    (entryId: string, direction: -1 | 1): CommandFeedback => {
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
    [state],
  );

  const addReservation = useCallback(
    (input: ReservationInput) =>
      applyResult(createReservation(state, input, new Date().toISOString())),
    [applyResult, state],
  );
  const updateReservationRecord = useCallback(
    (reservationId: string, input: ReservationInput) =>
      applyResult(
        updateReservation(
          state,
          reservationId,
          input,
          new Date().toISOString(),
        ),
      ),
    [applyResult, state],
  );
  const changeReservationStatus = useCallback(
    (
      reservationId: string,
      status: "ARRIVED" | "CANCELLED" | "NO_SHOW" | "COMPLETED",
    ) =>
      applyResult(
        setReservationStatus(
          state,
          reservationId,
          status,
          new Date().toISOString(),
        ),
      ),
    [applyResult, state],
  );
  const seatReservationRecord = useCallback(
    (reservationId: string, tableId: string) =>
      applyResult(
        seatReservation(
          state,
          reservationId,
          tableId,
          new Date().toISOString(),
          "Demo manager",
        ),
      ),
    [applyResult, state],
  );
  const addStaff = useCallback(
    (input: StaffInput) =>
      applyResult(addStaffMember(state, input, new Date().toISOString())),
    [applyResult, state],
  );
  const updateStaff = useCallback(
    (staffId: string, input: StaffInput) =>
      applyResult(
        updateStaffMember(state, staffId, input, new Date().toISOString()),
      ),
    [applyResult, state],
  );
  const setStaffStatus = useCallback(
    (staffId: string, active: boolean) =>
      applyResult(
        setStaffActive(state, staffId, active, new Date().toISOString()),
      ),
    [applyResult, state],
  );
  const removeStaff = useCallback(
    (staffId: string) =>
      applyResult(removeStaffMember(state, staffId, new Date().toISOString())),
    [applyResult, state],
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
    ): CommandFeedback => {
      const name = input.name.trim();
      const location = input.location.trim();
      if (!name || !location)
        return {
          ok: false,
          error: "Restaurant name and location are required.",
        };
      if (
        input.opensAtHour < 0 ||
        input.opensAtHour > 23 ||
        input.closesAtHour < 1 ||
        input.closesAtHour > 24
      ) {
        return { ok: false, error: "Opening and closing hours must be valid." };
      }
      if (input.closesAtHour <= input.opensAtHour) {
        return { ok: false, error: "Closing time must be after opening time." };
      }
      if (
        input.cleaningTargetMinutes < 1 ||
        input.cleaningTargetMinutes > 120
      ) {
        return {
          ok: false,
          error: "Cleaning target must be between 1 and 120 minutes.",
        };
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
      return { ok: true };
    },
    [state],
  );
  const reset = useCallback(
    () => dispatch({ type: "RESET", state: createDemoState() }),
    [],
  );

  const value = useMemo<DemoContextValue>(
    () => ({
      state,
      hydrated,
      transitionTable,
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
      addStaff,
      updateStaff,
      setStaffStatus,
      removeStaff,
      updateRestaurant,
      reset,
    }),
    [
      state,
      hydrated,
      transitionTable,
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

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) throw new Error("useDemo must be used inside DemoProvider");
  return context;
}
