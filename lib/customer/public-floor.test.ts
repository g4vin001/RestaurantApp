import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  fetchPublicRestaurantBySlug,
  fetchPublicRestaurants,
} from "@/lib/repositories/prisma/public-restaurant-view";
import {
  buildPublicFloor,
  toPublicTableStatus,
  type PublicFloorSource,
} from "./public-floor";

function floorWithTables(
  tables: Array<{ id: string; label: string; currentStatus: string }>,
): PublicFloorSource {
  return {
    id: "plan-1",
    name: "Main floor",
    logicalWidth: 1000,
    logicalHeight: 600,
    activeVersion: {
      id: "version-1",
      version: 1,
      publishedAt: new Date("2026-09-01T00:00:00Z"),
      createdAt: new Date("2026-09-01T00:00:00Z"),
      elements: tables.map((table, index) => ({
        stableElementId: `element-${table.id}`,
        type: "TABLE",
        x: 100 * (index + 1),
        y: 100,
        width: 80,
        height: 80,
        rotation: 0,
        zIndex: index + 1,
        visible: true,
        label: "",
        zone: "Main",
        shape: "SQUARE" as const,
        diningTable: {
          id: table.id,
          label: table.label,
          capacity: 4,
          zone: "Main",
          shape: "SQUARE" as const,
          currentStatus: table.currentStatus,
          active: true,
          archivedAt: null,
        },
      })),
    },
  };
}

describe("public floor projection", () => {
  it("collapses internal table states into customer-safe statuses", () => {
    expect(toPublicTableStatus("AVAILABLE")).toBe("AVAILABLE");
    expect(toPublicTableStatus("RESERVED")).toBe("RESERVED");
    expect(toPublicTableStatus("OCCUPIED")).toBe("IN_USE");
    expect(toPublicTableStatus("CLEANING")).toBe("PREPARING");
    expect(toPublicTableStatus("HELD")).toBe("UNAVAILABLE");
    expect(toPublicTableStatus("OUT_OF_SERVICE")).toBe("UNAVAILABLE");
  });

  it("publishes tables and customer-relevant structure without internal elements", () => {
    const floor = buildPublicFloor({
      id: "plan-1",
      name: "Main floor",
      logicalWidth: 1000,
      logicalHeight: 600,
      activeVersion: {
        id: "version-1",
        version: 3,
        publishedAt: new Date("2026-08-20T12:00:00Z"),
        createdAt: new Date("2026-08-20T11:59:00Z"),
        elements: [
          {
            stableElementId: "table-el",
            type: "TABLE",
            x: 100,
            y: 100,
            width: 120,
            height: 120,
            rotation: 0,
            zIndex: 2,
            visible: true,
            label: "ignored presentation label",
            zone: "Main",
            shape: "ROUND",
            diningTable: {
              id: "table-1",
              label: "T1",
              capacity: 4,
              zone: "Main",
              shape: "ROUND",
              currentStatus: "OCCUPIED",
              active: true,
              archivedAt: null,
            },
          },
          {
            stableElementId: "restroom-el",
            type: "RESTROOM",
            x: 800,
            y: 50,
            width: 100,
            height: 100,
            rotation: 0,
            zIndex: 1,
            visible: true,
            label: "Restroom",
            zone: null,
            shape: null,
            diningTable: null,
          },
          {
            stableElementId: "kitchen-el",
            type: "KITCHEN",
            x: 0,
            y: 0,
            width: 200,
            height: 100,
            rotation: 0,
            zIndex: 1,
            visible: true,
            label: "Back kitchen notes",
            zone: null,
            shape: null,
            diningTable: null,
          },
          {
            stableElementId: "text-el",
            type: "TEXT",
            x: 0,
            y: 0,
            width: 200,
            height: 50,
            rotation: 0,
            zIndex: 1,
            visible: true,
            label: "Internal note",
            zone: null,
            shape: null,
            diningTable: null,
          },
        ],
      },
    });

    expect(floor?.version).toBe(3);
    expect(floor?.elements).toHaveLength(2);
    expect(floor?.elements.find((element) => element.type === "TABLE")).toMatchObject({
      label: "T1",
      capacity: 4,
      status: "IN_USE",
    });
    expect(floor?.elements.map((element) => String(element.type))).not.toContain("KITCHEN");
    expect(floor?.elements.some((element) => element.label === "Internal note")).toBe(false);
  });

  it("marks a free table as reserved when it has approved bookings, and lists their times", () => {
    const floor = buildPublicFloor(
      floorWithTables([
        { id: "table-1", label: "T1", currentStatus: "AVAILABLE" },
        { id: "table-2", label: "T2", currentStatus: "AVAILABLE" },
      ]),
      [
        { assignedTableId: "table-1", scheduledAt: new Date("2026-09-04T14:00:00Z") },
        { assignedTableId: "table-1", scheduledAt: new Date("2026-09-04T12:00:00Z") },
      ],
    );

    const booked = floor?.elements.find((element) => element.tableId === "table-1");
    const free = floor?.elements.find((element) => element.tableId === "table-2");

    expect(booked?.status).toBe("RESERVED");
    // Ascending, regardless of the order they arrive in.
    expect(booked?.upcomingReservations).toEqual([
      "2026-09-04T12:00:00.000Z",
      "2026-09-04T14:00:00.000Z",
    ]);
    expect(free?.status).toBe("AVAILABLE");
    expect(free?.upcomingReservations).toBeUndefined();
  });

  it("keeps the live status of a table that is busy right now but booked later", () => {
    const floor = buildPublicFloor(
      floorWithTables([
        { id: "table-1", label: "T1", currentStatus: "OCCUPIED" },
        { id: "table-2", label: "T2", currentStatus: "CLEANING" },
      ]),
      [
        { assignedTableId: "table-1", scheduledAt: new Date("2026-09-04T14:00:00Z") },
        { assignedTableId: "table-2", scheduledAt: new Date("2026-09-04T15:00:00Z") },
      ],
    );

    const occupied = floor?.elements.find((element) => element.tableId === "table-1");
    const cleaning = floor?.elements.find((element) => element.tableId === "table-2");

    expect(occupied?.status).toBe("IN_USE");
    expect(occupied?.upcomingReservations).toHaveLength(1);
    expect(cleaning?.status).toBe("PREPARING");
    expect(cleaning?.upcomingReservations).toHaveLength(1);
  });

  it("ignores bookings that are not assigned to a table", () => {
    const floor = buildPublicFloor(
      floorWithTables([{ id: "table-1", label: "T1", currentStatus: "AVAILABLE" }]),
      [{ assignedTableId: null, scheduledAt: new Date("2026-09-04T14:00:00Z") }],
    );

    expect(floor?.elements[0].status).toBe("AVAILABLE");
    expect(floor?.elements[0].upcomingReservations).toBeUndefined();
  });

  it("publishes only the table and time of approved upcoming bookings", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const client = {
      restaurant: { findMany: vi.fn().mockResolvedValue([]), findFirst },
    } as unknown as PrismaClient;
    const now = new Date("2026-09-04T10:00:00Z");

    await fetchPublicRestaurantBySlug(client, "salu-salo", now);

    const reservations = findFirst.mock.calls[0][0].select.reservations;
    expect(reservations.select).toEqual({
      assignedTableId: true,
      scheduledAt: true,
    });
    expect(reservations.where.status).toEqual({ in: ["CONFIRMED", "ARRIVED"] });
    expect(reservations.where.assignedTableId).toEqual({ not: null });
    expect(reservations.where.scheduledAt).toEqual({
      gte: now,
      lte: new Date("2026-09-04T22:00:00Z"),
    });
  });

  it("excludes TEST and archived restaurants from every public query", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const findFirst = vi.fn().mockResolvedValue(null);
    const client = {
      restaurant: { findMany, findFirst },
    } as unknown as PrismaClient;

    await fetchPublicRestaurants(client);
    await fetchPublicRestaurantBySlug(client, "hidden-test-restaurant");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { environment: "LIVE", archivedAt: null },
      }),
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          slug: "hidden-test-restaurant",
          environment: "LIVE",
          archivedAt: null,
        },
      }),
    );

    const listSelect = findMany.mock.calls[0][0].select;
    expect(listSelect).not.toHaveProperty("reservations");
    expect(listSelect).not.toHaveProperty("staffMembers");
    expect(listSelect).not.toHaveProperty("tableStatusEvents");
    expect(listSelect.queueEntries.select).toEqual({
      partySize: true,
      status: true,
      joinedAt: true,
    });
    expect(listSelect.queueEntries.select).not.toHaveProperty("partyName");
    expect(listSelect.queueEntries.select).not.toHaveProperty("contact");
    expect(listSelect.queueEntries.select).not.toHaveProperty("notes");
  });
});
