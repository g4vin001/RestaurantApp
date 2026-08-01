export type TableStatus =
  | "AVAILABLE"
  | "HELD"
  | "RESERVED"
  | "OCCUPIED"
  | "CLEANING"
  | "OUT_OF_SERVICE";

export type QueueStatus =
  | "WAITING"
  | "CALLED"
  | "SEATED"
  | "CANCELLED"
  | "NO_SHOW";

export interface RestaurantIdentity {
  id: string;
  name: string;
  location: string;
  timezone: "Asia/Manila";
  isOpen: boolean;
  cleaningTargetMinutes: number;
}

export interface DiningTable {
  id: string;
  label: string;
  capacity: number;
  zone: string;
  status: TableStatus;
  statusChangedAt: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  shape: "ROUND" | "SQUARE" | "RECTANGLE" | "BOOTH";
  active: boolean;
}

export interface QueueEntry {
  id: string;
  partyName: string;
  partySize: number;
  status: QueueStatus;
  joinedAt: string;
  promisedWaitMinutes: number;
  seatedAt?: string;
}

export interface TableSession {
  id: string;
  tableId: string;
  partySize: number;
  seatedAt: string;
  clearedAt?: string;
  readyAt?: string;
}

export interface TableStatusEvent {
  id: string;
  tableId: string;
  previousStatus: TableStatus;
  newStatus: TableStatus;
  occurredAt: string;
  actor: string;
  note?: string;
}

export interface Reservation {
  id: string;
  partyName: string;
  partySize: number;
  scheduledAt: string;
  status: "CONFIRMED" | "ARRIVED" | "SEATED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  tableId?: string;
}

export interface DemoState {
  version: 1;
  restaurant: RestaurantIdentity;
  tables: DiningTable[];
  queue: QueueEntry[];
  sessions: TableSession[];
  events: TableStatusEvent[];
  reservations: Reservation[];
  lastUpdatedAt: string;
}
