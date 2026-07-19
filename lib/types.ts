export type CrowdLevel = "Low" | "Moderate" | "Busy";
export type WalkInStatus = "Available" | "Limited" | "Paused";
export type TableStatus = "Available" | "Occupied" | "Cleaning" | "Reserved";
export type QueueStatus = "Waiting" | "Seated" | "Cancelled";
export type LayoutItemType = "table" | "bar-seat" | "waiting-area";

export interface Restaurant {
  id: string; name: string; location: string; cuisineType: string; crowdLevel: CrowdLevel;
  estimatedWaitMinutes: number; groupsWaiting: number; walkInStatus: WalkInStatus; lastUpdatedAt: string;
}
export interface LayoutItem {
  id: string; label: string; type: LayoutItemType; seatCount: number; status: TableStatus; x: number; y: number;
}
export interface QueueEntry { id: string; customerName: string; groupSize: number; status: QueueStatus; arrivalTime: string; }
export interface AnalyticsSummary {
  totalTables: number; occupiedTables: number; availableTables: number; occupancyRate: number;
  averageWaitMinutes: number; groupsWaiting: number;
}
export interface TableStatistics {
  tableId: string; timesSeatedToday: number; averageStayMinutes: number; busiestPeriod: string;
}
