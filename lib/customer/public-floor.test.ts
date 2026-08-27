import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  fetchPublicRestaurantBySlug,
  fetchPublicRestaurants,
} from "@/lib/repositories/prisma/public-restaurant-view";
import { buildPublicFloor, toPublicTableStatus } from "./public-floor";

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
  });
});
