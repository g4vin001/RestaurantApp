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

export type FloorElementType =
  | "TABLE"
  | "BAR"
  | "WALL"
  | "DOOR"
  | "HOST_STAND"
  | "WAITING_AREA"
  | "KITCHEN"
  | "RESTROOM"
  | "COLUMN"
  | "TEXT"
  | "ZONE";

export type TableShape = "ROUND" | "SQUARE" | "RECTANGLE" | "BOOTH";

export interface FloorElement {
  id: string;
  type: FloorElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  locked: boolean;
  visible: boolean;
  label: string;
  zone?: string;
  tableId?: string;
  shape?: TableShape;
  capacity?: number;
  minPartySize?: number;
  maxPartySize?: number;
  notes?: string;
  color?: string;
}

export interface FloorPlanDraft {
  elements: FloorElement[];
  logicalWidth: number;
  logicalHeight: number;
  savedAt: string;
  baseVersion: number;
}

export interface FloorPlanVersion {
  id: string;
  version: number;
  name: string;
  elements: FloorElement[];
  logicalWidth: number;
  logicalHeight: number;
  publishedAt: string;
  publishedBy: string;
}

export interface FloorPlan {
  id: string;
  name: string;
  draft: FloorPlanDraft;
  versions: FloorPlanVersion[];
  activeVersionId: string | null;
  updatedAt: string;
}

export interface RestaurantIdentity {
  id: string;
  name: string;
  location: string;
  timezone: "Asia/Manila";
  isOpen: boolean;
  cleaningTargetMinutes: number;
  opensAtHour: number;
  closesAtHour: number;
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
  shape: TableShape;
  active: boolean;
}

export interface QueueEntry {
  id: string;
  partyName: string;
  partySize: number;
  status: QueueStatus;
  joinedAt: string;
  promisedWaitMinutes: number;
  contact?: string;
  notes?: string;
  preferredZone?: string;
  calledAt?: string;
  seatedAt?: string;
  cancelledAt?: string;
  noShowAt?: string;
  assignedTableId?: string;
  assignedTableIds?: string[];
  updatedAt: string;
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
  status:
    | "CONFIRMED"
    | "ARRIVED"
    | "SEATED"
    | "COMPLETED"
    | "CANCELLED"
    | "NO_SHOW";
  tableId?: string;
  tableIds?: string[];
  contact?: string;
  notes?: string;
  arrivedAt?: string;
  seatedAt?: string;
  completedAt?: string;
  updatedAt: string;
}

export type StaffPermissionPreset = "MANAGER" | "HOST" | "FLOOR_STAFF";

export interface StaffMember {
  id: string;
  name: string;
  jobTitle: string;
  contact?: string;
  permissionPreset: StaffPermissionPreset;
  active: boolean;
  accessStatus: "NOT_INVITED" | "ACCESS_DISABLED";
  createdAt: string;
  updatedAt: string;
}

export interface DemoState {
  version: 2;
  restaurant: RestaurantIdentity;
  tables: DiningTable[];
  floorPlans: FloorPlan[];
  activeFloorPlanId: string;
  queue: QueueEntry[];
  sessions: TableSession[];
  events: TableStatusEvent[];
  reservations: Reservation[];
  staff: StaffMember[];
  lastUpdatedAt: string;
}
