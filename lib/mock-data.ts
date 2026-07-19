import type { AnalyticsSummary, LayoutItem, QueueEntry, Restaurant, TableStatistics } from "@/lib/types";

export const restaurants: Restaurant[] = [
  { id: "salu-salo", name: "Salu-Salo Kitchen", location: "Quezon City", cuisineType: "Filipino", crowdLevel: "Moderate", estimatedWaitMinutes: 20, groupsWaiting: 4, walkInStatus: "Available", lastUpdatedAt: "2026-07-17T12:10:00+08:00" },
  { id: "bahay-kubo", name: "Bahay Kubo Grill", location: "Makati", cuisineType: "Filipino Grill", crowdLevel: "Busy", estimatedWaitMinutes: 40, groupsWaiting: 9, walkInStatus: "Limited", lastUpdatedAt: "2026-07-17T12:08:00+08:00" },
  { id: "merienda", name: "Merienda Corner", location: "Pasig", cuisineType: "Filipino Café", crowdLevel: "Low", estimatedWaitMinutes: 5, groupsWaiting: 1, walkInStatus: "Available", lastUpdatedAt: "2026-07-17T12:12:00+08:00" },
];

export const layoutItems: LayoutItem[] = [
  { id: "t1", label: "Table 1", type: "table", seatCount: 2, status: "Occupied", x: 10, y: 15 },
  { id: "t2", label: "Table 2", type: "table", seatCount: 2, status: "Available", x: 43, y: 15 },
  { id: "t3", label: "Table 3", type: "table", seatCount: 4, status: "Occupied", x: 10, y: 55 },
  { id: "t4", label: "Table 4", type: "table", seatCount: 4, status: "Cleaning", x: 43, y: 55 },
  { id: "bar", label: "Bar Seats", type: "bar-seat", seatCount: 6, status: "Available", x: 75, y: 20 },
  { id: "wait", label: "Waiting Area", type: "waiting-area", seatCount: 8, status: "Available", x: 75, y: 62 },
];

export const queueEntries: QueueEntry[] = [
  { id: "q1", customerName: "Garcia family", groupSize: 4, status: "Waiting", arrivalTime: "11:45 AM" },
  { id: "q2", customerName: "Ana Cruz", groupSize: 2, status: "Waiting", arrivalTime: "11:52 AM" },
  { id: "q3", customerName: "Reyes group", groupSize: 5, status: "Waiting", arrivalTime: "12:03 PM" },
];

export const analyticsSummary: AnalyticsSummary = { totalTables: 4, occupiedTables: 2, availableTables: 1, occupancyRate: 50, averageWaitMinutes: 20, groupsWaiting: 3 };

export const tableStatistics: TableStatistics[] = [
  { tableId: "t1", timesSeatedToday: 5, averageStayMinutes: 48, busiestPeriod: "12–1 PM" },
  { tableId: "t2", timesSeatedToday: 4, averageStayMinutes: 42, busiestPeriod: "6–7 PM" },
  { tableId: "t3", timesSeatedToday: 3, averageStayMinutes: 65, busiestPeriod: "12–1 PM" },
  { tableId: "t4", timesSeatedToday: 4, averageStayMinutes: 55, busiestPeriod: "7–8 PM" },
];
