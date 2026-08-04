import type { TableStatus } from "@/lib/domain/types";

export const TABLE_TRANSITIONS: Record<TableStatus, readonly TableStatus[]> = {
  AVAILABLE: ["HELD", "RESERVED", "OCCUPIED", "OUT_OF_SERVICE"],
  HELD: ["OCCUPIED", "AVAILABLE"],
  RESERVED: ["OCCUPIED", "AVAILABLE", "OUT_OF_SERVICE"],
  OCCUPIED: ["CLEANING"],
  CLEANING: ["AVAILABLE"],
  OUT_OF_SERVICE: ["AVAILABLE"],
};

export function canTransitionTable(from: TableStatus, to: TableStatus) {
  return TABLE_TRANSITIONS[from].includes(to);
}

export function tableStatusLabel(status: TableStatus) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
