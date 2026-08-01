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
import { canTransitionTable } from "@/lib/domain/transitions";
import type { DemoState, TableStatus } from "@/lib/domain/types";
import { createDemoState } from "@/lib/demo/seed";

const STORAGE_KEY = "halina:demo-state:v1";
const CHANNEL_NAME = "halina:demo-state";

type DemoAction =
  | { type: "HYDRATE"; state: DemoState }
  | { type: "RESET"; state: DemoState }
  | { type: "TRANSITION_TABLE"; tableId: string; status: TableStatus; occurredAt: string };

function reducer(state: DemoState, action: DemoAction): DemoState {
  if (action.type === "HYDRATE" || action.type === "RESET") return action.state;

  const table = state.tables.find((item) => item.id === action.tableId);
  if (!table || !canTransitionTable(table.status, action.status)) return state;

  const sessions = state.sessions.map((session) => {
    if (session.tableId !== table.id || session.readyAt) return session;
    if (table.status === "OCCUPIED" && action.status === "CLEANING" && !session.clearedAt) {
      return { ...session, clearedAt: action.occurredAt };
    }
    if (table.status === "CLEANING" && action.status === "AVAILABLE" && session.clearedAt) {
      return { ...session, readyAt: action.occurredAt };
    }
    return session;
  });

  if (action.status === "OCCUPIED" && table.status !== "OCCUPIED") {
    sessions.push({
      id: `session-${action.occurredAt}-${table.id}`,
      tableId: table.id,
      partySize: Math.min(2, table.capacity),
      seatedAt: action.occurredAt,
    });
  }

  return {
    ...state,
    tables: state.tables.map((item) =>
      item.id === table.id
        ? { ...item, status: action.status, statusChangedAt: action.occurredAt }
        : item,
    ),
    sessions,
    events: [
      {
        id: `event-${action.occurredAt}-${table.id}`,
        tableId: table.id,
        previousStatus: table.status,
        newStatus: action.status,
        occurredAt: action.occurredAt,
        actor: "Demo manager",
      },
      ...state.events,
    ],
    lastUpdatedAt: action.occurredAt,
  };
}

interface DemoContextValue {
  state: DemoState;
  hydrated: boolean;
  transitionTable: (tableId: string, status: TableStatus) => boolean;
  reset: () => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => createDemoState());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as DemoState;
        if (parsed.version === 1) dispatch({ type: "HYDRATE", state: parsed });
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(state);
    channel.close();
  }, [hydrated, state]);

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<DemoState>) => {
      if (event.data?.version === 1 && event.data.lastUpdatedAt !== state.lastUpdatedAt) {
        dispatch({ type: "HYDRATE", state: event.data });
      }
    };
    return () => channel.close();
  }, [state.lastUpdatedAt]);

  const transitionTable = useCallback(
    (tableId: string, status: TableStatus) => {
      const table = state.tables.find((item) => item.id === tableId);
      if (!table || !canTransitionTable(table.status, status)) return false;
      dispatch({ type: "TRANSITION_TABLE", tableId, status, occurredAt: new Date().toISOString() });
      return true;
    },
    [state.tables],
  );

  const reset = useCallback(() => {
    dispatch({ type: "RESET", state: createDemoState() });
  }, []);

  const value = useMemo(
    () => ({ state, hydrated, transitionTable, reset }),
    [state, hydrated, transitionTable, reset],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) throw new Error("useDemo must be used inside DemoProvider");
  return context;
}
