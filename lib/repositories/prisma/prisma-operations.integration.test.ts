import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { OperationsRepositoryError } from "@/lib/repositories/operations";
import { executeOperationsCommand, type OperationsCommandScope } from "./operations-commands";
import { PrismaOperationsRepository } from "./prisma-operations";
import { legacyOperatingSchedule } from "@/lib/domain/restaurant-schedule";
import { randomUUID } from "node:crypto";
import { fetchPublicRestaurantBySlug, fetchPublicRestaurants } from "./public-restaurant-view";
import { createCustomerReservation, fetchCustomerReservations } from "./customer-reservations";
import { staffSeatingOptions } from "@/lib/staff/seating";
import { deriveAnalytics } from "@/lib/domain/analytics";

const connectionString = process.env.HALINA_TEST_DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

const ownerId = "33333333-3333-4333-8333-333333333333";
const otherOwnerId = "44444444-4444-4444-8444-444444444444";
const hostId = "11111111-2222-4111-8111-111111111111";
const viewerId = "22222222-3333-4222-8222-222222222222";
// Deliberately distinct from every other integration fixture so Vitest's
// parallel files cannot delete or mutate this suite's tenant state.
const restaurantId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const otherRestaurantId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

describeWithDatabase("Prisma operations repository", () => {
  let pool: Pool;
  let client: PrismaClient;

  beforeAll(() => {
    pool = new Pool({ connectionString });
    client = new PrismaClient({ adapter: new PrismaPg(pool) });
  });

  async function writableManagerRepository() {
    const membership = await client.restaurantMembership.findUniqueOrThrow({
      where: { restaurantId_profileId: { restaurantId, profileId: ownerId } },
    });
    return new PrismaOperationsRepository(client, {
      profileId: ownerId, restaurantId,
      membershipId: membership.id, membershipRole: membership.role,
    });
  }

  async function operationsScope(role: "OWNER" | "STAFF"): Promise<OperationsCommandScope> {
    const profileId = role === "OWNER" ? ownerId : hostId;
    const membership = await client.restaurantMembership.findUniqueOrThrow({
      where: { restaurantId_profileId: { restaurantId, profileId } },
    });
    return {
      profileId, restaurantId, membershipId: membership.id, membershipRole: role,
      permissions: ["MANAGE_QUEUE", "CHANGE_TABLE_STATUS", "SEAT_PARTIES", "CORRECT_RECENT_ACTION"],
    };
  }

  async function publishedFloor(name: string, tableIds: string[]) {
    const plan = await client.floorPlan.create({ data: { restaurantId, name } });
    const version = await client.floorPlanVersion.create({
      data: {
        floorPlanId: plan.id, name, version: 1, logicalWidth: 1600, logicalHeight: 1000,
        elements: {
          create: tableIds.map((diningTableId, index) => ({
            diningTableId, stableElementId: randomUUID(), type: "TABLE",
            x: 180 * (index + 1), y: 140, width: 120, height: 120,
          })),
        },
      },
    });
    await client.floorPlan.update({ where: { id: plan.id }, data: { activeVersionId: version.id } });
  }

  beforeEach(async () => {
    await client.seatingAssignment.deleteMany({
      where: { restaurantId: { in: [restaurantId, otherRestaurantId] } },
    });
    await client.restaurant.deleteMany({
      where: { id: { in: [restaurantId, otherRestaurantId] } },
    });
    await client.profile.deleteMany({
      where: { id: { in: [ownerId, otherOwnerId, hostId, viewerId] } },
    });
    await client.profile.createMany({
      data: [
        {
          id: ownerId,
          email: "snapshot-owner@example.com",
          displayName: "Owner",
        },
        {
          id: otherOwnerId,
          email: "snapshot-other@example.com",
          displayName: "Other owner",
        },
        {
          id: hostId,
          email: "snapshot-host@example.com",
          displayName: "Host",
        },
        {
          id: viewerId,
          email: "snapshot-viewer@example.com",
          displayName: "Viewer",
        },
      ],
    });
    await client.restaurant.create({
      data: {
        id: restaurantId,
        slug: "repository-test",
        lifecycle: "PUBLISHED",
        name: "Repository Test Kitchen",
        location: "Quezon City",
        operatingSettings: {
          opensAtHour: 9,
          closesAtHour: 23,
          cleaningTargetMinutes: 14,
          // Permission/concurrency fixtures remain valid at any wall-clock time.
          schedule: legacyOperatingSchedule(0, 24),
        },
        memberships: {
          create: [
            { profileId: ownerId, role: "OWNER" },
            { profileId: hostId, role: "STAFF" },
            { profileId: viewerId, role: "STAFF" },
          ],
        },
        floorPlans: {
          create: {
            name: "Main floor",
            draftSnapshot: {
              elements: [],
              logicalWidth: 1600,
              logicalHeight: 1000,
            },
          },
        },
        diningTables: {
          create: [
            {
              label: "T1",
              capacity: 4,
              minPartySize: 2,
              maxPartySize: 5,
              zone: "Main",
              shape: "RECTANGLE",
            },
            {
              label: "T2",
              capacity: 2,
              minPartySize: 1,
              maxPartySize: 2,
              zone: "Main",
              shape: "ROUND",
            },
          ],
        },
        queueEntries: {
          create: {
            partyName: "Reyes",
            partySize: 5,
            promisedWaitMinutes: 15,
            createdById: ownerId,
          },
        },
      },
    });
    await client.restaurant.create({
      data: {
        id: otherRestaurantId,
        slug: "other-repository-test",
        name: "Other Kitchen",
        memberships: {
          create: { profileId: otherOwnerId, role: "OWNER" },
        },
        floorPlans: {
          create: { name: "Other floor", draftSnapshot: { elements: [] } },
        },
        diningTables: {
          create: {
            label: "PRIVATE",
            capacity: 2,
            maxPartySize: 2,
            shape: "ROUND",
          },
        },
      },
    });
  });

  afterAll(async () => {
    await client?.seatingAssignment.deleteMany({
      where: { restaurantId: { in: [restaurantId, otherRestaurantId] } },
    });
    await client?.restaurant.deleteMany({
      where: { id: { in: [restaurantId, otherRestaurantId] } },
    });
    await client?.profile.deleteMany({
      where: { id: { in: [ownerId, otherOwnerId, hostId, viewerId] } },
    });
    await client?.$disconnect();
    await pool?.end();
  });

  it("loads only the authenticated manager's restaurant snapshot", async () => {
    const repository = new PrismaOperationsRepository(client, {
      profileId: ownerId,
      restaurantId,
    });

    const snapshot = await repository.loadSnapshot();

    expect(snapshot.restaurant).toMatchObject({
      id: restaurantId,
      name: "Repository Test Kitchen",
      cleaningTargetMinutes: 14,
    });
    expect(snapshot.tables.map((table) => table.label)).toEqual(["T1", "T2"]);
    expect(snapshot.queue.map((entry) => entry.partyName)).toEqual(["Reyes"]);
    expect(snapshot.floorPlans).toHaveLength(1);
  });

  it("shares staff pair seating and correction with managers and the public projection", async () => {
    const manager = new PrismaOperationsRepository(client, { profileId: ownerId, restaurantId });
    const before = await manager.loadSnapshot();
    const entry = before.queue[0];
    const pair = staffSeatingOptions(before, entry, new Date()).find((option) => option.tableIds.length === 2)!;
    expect(pair.tableIds).toHaveLength(2);
    const member = await client.restaurantMembership.findUniqueOrThrow({ where: { restaurantId_profileId: { restaurantId, profileId: hostId } } });
    const scope = { profileId: hostId, restaurantId, membershipId: member.id, membershipRole: "STAFF" as const, permissions: ["SEAT_PARTIES", "CORRECT_RECENT_ACTION"] as ("SEAT_PARTIES" | "CORRECT_RECENT_ACTION")[] };
    const command = { type: "SEAT_QUEUE" as const, commandId: randomUUID(), entryId: entry.id, expectedRevision: entry.revision!, tableIds: pair.tableIds };
    await expect(executeOperationsCommand(client, { ...scope, permissions: [] }, command)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await executeOperationsCommand(client, scope, command);
    await executeOperationsCommand(client, scope, command); // Retrying must not seat twice.
    const seated = await manager.loadSnapshot();
    expect(seated.tables.filter((table) => pair.tableIds.includes(table.id)).map((table) => table.status)).toEqual(["OCCUPIED", "OCCUPIED"]);
    expect(seated.queue.find((party) => party.id === entry.id)?.assignedTableIds).toHaveLength(2);
    expect(seated.sessions.reduce((sum, session) => sum + session.partySize, 0)).toBe(entry.partySize);
    expect(seated.sessions.every((session) => session.partySize <= seated.tables.find((table) => table.id === session.tableId)!.capacity)).toBe(true);
    const analyticsEnd = new Date(Date.now() + 60_000);
    const analytics = deriveAnalytics({ ...seated, sessions: seated.sessions.map((session) => ({ ...session, clearedAt: analyticsEnd.toISOString() })) }, {
      start: new Date(Date.now() - 60_000), end: analyticsEnd, label: "Pair seating",
    }, {}, analyticsEnd);
    expect(analytics.seatUtilization).toBeLessThanOrEqual(100);
    expect(analytics.tableAnalytics.every((table) => table.seatUtilization !== null && table.seatUtilization <= 100)).toBe(true);
    expect(await client.seatingAssignment.count({ where: { restaurantId, status: "ACTIVE" } })).toBe(1);
    const customer = await fetchPublicRestaurantBySlug(client, "repository-test");
    expect(customer).not.toBeNull();
    expect(customer?.availableSeatCapacity).toBe(0);
    expect(JSON.stringify(customer)).not.toContain(entry.partyName);
    await expect(executeOperationsCommand(client, scope, { ...command, commandId: randomUUID() })).rejects.toMatchObject({ code: "CONFLICT" });
    const table = await client.diningTable.findUniqueOrThrow({ where: { id: pair.tableIds[0] } });
    const correction = { type: "CORRECT_TABLE" as const, commandId: randomUUID(), tableId: table.id, expectedRevision: table.statusRevision, reason: "Wrong party was seated" };
    await executeOperationsCommand(client, scope, correction);
    const restored = await manager.loadSnapshot();
    expect(restored.tables.filter((item) => pair.tableIds.includes(item.id)).map((item) => item.status)).toEqual(["AVAILABLE", "AVAILABLE"]);
    expect(restored.queue.find((party) => party.id === entry.id)?.status).toBe("WAITING");
    expect(await client.diningSession.count({ where: { restaurantId } })).toBe(0);
    expect((await fetchPublicRestaurantBySlug(client, "repository-test"))?.availableSeatCapacity).toBe(6);
    const revised = await client.diningTable.findUniqueOrThrow({ where: { id: table.id } });
    await expect(executeOperationsCommand(client, scope, { ...correction, commandId: randomUUID(), expectedRevision: revised.statusRevision })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it.each(["CONFIRMED", "ARRIVED"] as const)("restores a %s reservation's arrival state when correcting seating", async (status) => {
    const repository = await writableManagerRepository();
    const tables = await client.diningTable.findMany({ where: { restaurantId } });
    const arrivedAt = status === "ARRIVED" ? new Date() : null;
    const reservation = await client.reservation.create({ data: {
      restaurantId, partyName: "Correction fixture", partySize: 5,
      scheduledAt: new Date(), status, arrivedAt, createdById: ownerId,
    } });
    await repository.execute({ type: "SEAT_RESERVATION", commandId: randomUUID(), reservationId: reservation.id, expectedRevision: reservation.revision, tableIds: tables.map((table) => table.id) });
    const seatedTable = await client.diningTable.findUniqueOrThrow({ where: { id: tables[0].id } });
    await repository.execute({ type: "CORRECT_TABLE", commandId: randomUUID(), tableId: seatedTable.id, expectedRevision: seatedTable.statusRevision, reason: "Selected the wrong reservation" });
    const restored = await client.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    expect(restored).toMatchObject({ status, arrivedAt, seatedAt: null, assignedTableId: null });
    expect(await client.diningTable.count({ where: { restaurantId, currentStatus: "AVAILABLE" } })).toBe(2);
    expect(await client.diningSession.count({ where: { reservationId: reservation.id } })).toBe(0);
  });

  it("persists schedules for another device, preserves unrelated settings, and rejects stale edits", async () => {
    const repository = await writableManagerRepository();
    const before = await repository.loadSnapshot();
    const schedule = legacyOperatingSchedule(11, 22);
    schedule.weekly.monday = [{ opensAt: "11:00", closesAt: "14:00" }, { opensAt: "18:00", closesAt: "01:00" }];
    schedule.exceptions = [{ date: "2026-12-25", label: "Christmas", periods: [] }];
    const command = {
      type: "UPDATE_RESTAURANT" as const,
      commandId: "90909090-9090-4090-8090-909090909090",
      expectedRevision: before.restaurant.revision ?? 0,
      input: { ...before.restaurant, schedule },
    };
    await repository.execute(command);
    await repository.execute(command);
    const anotherDevice = await new PrismaOperationsRepository(client, { profileId: ownerId, restaurantId }).loadSnapshot();
    expect(anotherDevice.restaurant.schedule).toEqual(schedule);
    expect(anotherDevice.restaurant.cleaningTargetMinutes).toBe(14);
    expect(anotherDevice.restaurant.revision).toBe(command.expectedRevision + 1);
    await expect(repository.execute({ ...command, commandId: "91919191-9191-4191-8191-919191919191" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await client.restaurant.findUniqueOrThrow({ where: { id: otherRestaurantId } })).toMatchObject({ name: "Other Kitchen" });
  });

  it("rejects invalid schedules atomically without changing the restaurant name", async () => {
    const repository = await writableManagerRepository();
    const before = await repository.loadSnapshot();
    const schedule = legacyOperatingSchedule(10, 22);
    schedule.weekly.monday.push({ opensAt: "12:00", closesAt: "14:00" });
    await expect(repository.execute({
      type: "UPDATE_RESTAURANT", commandId: "92929292-9292-4292-8292-929292929292", expectedRevision: before.restaurant.revision ?? 0,
      input: { ...before.restaurant, name: "Must not be saved", schedule },
    })).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await repository.loadSnapshot()).restaurant).toEqual(before.restaurant);
  });

  it("denies schedule changes from staff and from another restaurant's owner", async () => {
    const owner = new PrismaOperationsRepository(client, { profileId: ownerId, restaurantId });
    const before = await owner.loadSnapshot();
    const command = {
      type: "UPDATE_RESTAURANT" as const, commandId: "93939393-9393-4393-8393-939393939393", expectedRevision: before.restaurant.revision ?? 0,
      input: { ...before.restaurant, schedule: legacyOperatingSchedule(11, 22) },
    };
    const hostMembership = await client.restaurantMembership.findUniqueOrThrow({ where: { restaurantId_profileId: { restaurantId, profileId: hostId } } });
    await expect(executeOperationsCommand(client, {
      profileId: hostId, restaurantId, membershipId: hostMembership.id, membershipRole: "STAFF", permissions: ["MANAGE_QUEUE"],
    }, command)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(new PrismaOperationsRepository(client, { profileId: otherOwnerId, restaurantId }).execute(command)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await owner.loadSnapshot()).restaurant).toEqual(before.restaurant);
  });

  it("denies a restaurant outside the manager's membership", async () => {
    const repository = new PrismaOperationsRepository(client, {
      profileId: ownerId,
      restaurantId: otherRestaurantId,
    });

    await expect(repository.loadSnapshot()).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<OperationsRepositoryError>);
  });

  it("lets guest-management staff operate reservations but denies view-only staff", async () => {
    const [hostMembership, viewerMembership] = await Promise.all([
      client.restaurantMembership.findUniqueOrThrow({
        where: {
          restaurantId_profileId: { restaurantId, profileId: hostId },
        },
      }),
      client.restaurantMembership.findUniqueOrThrow({
        where: {
          restaurantId_profileId: { restaurantId, profileId: viewerId },
        },
      }),
    ]);

    await executeOperationsCommand(
      client,
      {
        profileId: hostId,
        restaurantId,
        membershipId: hostMembership.id,
        membershipRole: "STAFF",
        permissions: ["VIEW_QUEUE", "MANAGE_QUEUE"],
      },
      {
        type: "ADD_RESERVATION",
        commandId: "10101010-1010-4010-8010-101010101010",
        input: {
          partyName: "Staff-created booking",
          partySize: 3,
          scheduledAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        },
      },
    );

    expect(
      await client.reservation.count({
        where: { restaurantId, partyName: "Staff-created booking" },
      }),
    ).toBe(1);

    await expect(
      executeOperationsCommand(
        client,
        {
          profileId: viewerId,
          restaurantId,
          membershipId: viewerMembership.id,
          membershipRole: "STAFF",
          permissions: ["VIEW_QUEUE"],
        },
        {
          type: "ADD_RESERVATION",
          commandId: "20202020-2020-4020-8020-202020202020",
          input: {
            partyName: "Unauthorized booking",
            partySize: 2,
            scheduledAt: new Date(Date.now() + 90 * 60_000).toISOString(),
          },
        },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("seats a queue party across two tables atomically and replays idempotently", async () => {
    const membership = await client.restaurantMembership.findUniqueOrThrow({
      where: {
        restaurantId_profileId: { restaurantId, profileId: ownerId },
      },
    });
    const [entry, tables] = await Promise.all([
      client.queueEntry.findFirstOrThrow({ where: { restaurantId } }),
      client.diningTable.findMany({
        where: { restaurantId },
        orderBy: { label: "asc" },
      }),
    ]);
    const repository = new PrismaOperationsRepository(client, {
      profileId: ownerId,
      restaurantId,
      membershipId: membership.id,
      membershipRole: membership.role,
    });
    const command = {
      type: "SEAT_QUEUE" as const,
      commandId: "55555555-5555-4555-8555-555555555555",
      entryId: entry.id,
      expectedRevision: entry.revision,
      tableIds: tables.map((table) => table.id),
    };

    await repository.execute(command);
    await repository.execute(command);

    const [storedEntry, assignmentCount, assignmentTables, sessions] =
      await Promise.all([
        client.queueEntry.findUniqueOrThrow({ where: { id: entry.id } }),
        client.seatingAssignment.count({ where: { queueEntryId: entry.id } }),
        client.seatingAssignmentTable.count({
          where: { seatingAssignment: { queueEntryId: entry.id } },
        }),
        client.diningSession.count({ where: { queueEntryId: entry.id } }),
      ]);
    expect(storedEntry.status).toBe("SEATED");
    expect(assignmentCount).toBe(1);
    expect(assignmentTables).toBe(2);
    expect(sessions).toBe(2);
    expect(
      await client.diningTable.count({
        where: { restaurantId, currentStatus: "OCCUPIED" },
      }),
    ).toBe(2);

    await expect(
      repository.execute({
        ...command,
        commandId: "66666666-6666-4666-8666-666666666666",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it.each(["OWNER", "STAFF"] as const)("keeps the %s floor clear in sync with customer booking status", async (role) => {
    const scope = await operationsScope(role);
    const manager = await writableManagerRepository();
    const tables = await client.diningTable.findMany({ where: { restaurantId }, orderBy: { label: "asc" } });
    await publishedFloor("Main", tables.map((table) => table.id));
    const booking = await client.reservation.create({ data: {
      restaurantId, partyName: "Booked party", customerProfileId: viewerId,
      scheduledAt: new Date(), status: "CONFIRMED", partySize: 5,
      customerNote: "Show this to the guest", notes: "Internal handoff only",
    } });
    const commandId = randomUUID();
    await executeOperationsCommand(client, scope, {
      type: "SEAT_RESERVATION", commandId, reservationId: booking.id, expectedRevision: booking.revision,
      tableIds: tables.map((table) => table.id),
    });

    async function tableTransition(status: "CLEANING" | "AVAILABLE") {
      const table = await client.diningTable.findUniqueOrThrow({ where: { id: tables[0].id } });
      await executeOperationsCommand(client, scope, {
        type: "TRANSITION_TABLE", commandId: randomUUID(), tableId: table.id,
        expectedRevision: table.statusRevision, status,
      });
    }
    const initial = await fetchPublicRestaurantBySlug(client, "repository-test");
    expect(initial?.publicFloors[0].elements.map((table) => table.status)).toEqual(["IN_USE", "IN_USE"]);
    await expect(createCustomerReservation(client, {
      restaurantId, customerProfileId: otherOwnerId, partyName: "Another diner", partySize: 1,
      scheduledAt: booking.scheduledAt,
    })).rejects.toMatchObject({ code: "CONFLICT" });
    await tableTransition("CLEANING");
    const cleaning = await fetchPublicRestaurantBySlug(client, "repository-test");
    expect(cleaning?.publicFloors[0].elements.map((table) => table.status)).toEqual(["PREPARING", "PREPARING"]);
    expect((await manager.loadSnapshot()).reservations.find((item) => item.id === booking.id)?.status).toBe("COMPLETED");
    const [customer] = await fetchCustomerReservations(client, viewerId);
    expect(customer).toMatchObject({ status: "COMPLETED", customerNote: "Show this to the guest" });
    expect(customer).not.toHaveProperty("notes");

    await tableTransition("AVAILABLE");
    const ready = await fetchPublicRestaurantBySlug(client, "repository-test");
    expect(ready?.publicFloors[0].elements.map((table) => table.status)).toEqual(["AVAILABLE", "AVAILABLE"]);
    expect(ready?.availableTables).toBe(2);
    expect(await client.diningSession.count({ where: { reservationId: booking.id, status: "COMPLETED" } })).toBe(2);
  });

  it.each(["OWNER", "STAFF"] as const)("blocks the %s from flagging a table reserved without a booking", async (role) => {
    const scope = await operationsScope(role);
    const table = await client.diningTable.findFirstOrThrow({ where: { restaurantId } });
    await expect(executeOperationsCommand(client, scope, {
      type: "TRANSITION_TABLE", commandId: randomUUID(), tableId: table.id,
      expectedRevision: table.statusRevision, status: "RESERVED",
    })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await client.reservation.count({ where: { restaurantId } })).toBe(0);
    expect(await client.diningTable.findUniqueOrThrow({ where: { id: table.id } })).toMatchObject({ currentStatus: "AVAILABLE" });
  });

  it("prevents both staff and managers from combining matching zones across two floors", async () => {
    const staff = await operationsScope("STAFF");
    const manager = await operationsScope("OWNER");
    const tables = await client.diningTable.findMany({ where: { restaurantId }, orderBy: { label: "asc" } });
    await publishedFloor("Ground", [tables[0].id]);
    await publishedFloor("Upstairs", [tables[1].id]);
    const snapshot = await (await writableManagerRepository()).loadSnapshot();
    const party = snapshot.queue[0];
    expect(staffSeatingOptions(snapshot, party, new Date())).toEqual([]);
    for (const scope of [staff, manager]) {
      await expect(executeOperationsCommand(client, scope, {
        type: "SEAT_QUEUE", commandId: randomUUID(), entryId: party.id,
        expectedRevision: party.revision ?? 0, tableIds: tables.map((table) => table.id),
      })).rejects.toThrow("same floor and in the same zone");
    }
    const publicView = await fetchPublicRestaurantBySlug(client, "repository-test");
    expect(publicView?.publicFloors.map(({ name }) => name)).toEqual(["Ground", "Upstairs"]);
    expect(publicView?.availableTables).toBe(2);
  });

  it("counts a near-term approved booking consistently across directory, map, and staff seating", async () => {
    const tables = await client.diningTable.findMany({ where: { restaurantId }, orderBy: { label: "asc" } });
    await publishedFloor("Main", tables.map((table) => table.id));
    const now = new Date();
    await client.reservation.createMany({ data: [
      { restaurantId, partyName: "Near", partySize: 4, scheduledAt: new Date(now.getTime() + 15 * 60_000), assignedTableId: tables[0].id, status: "CONFIRMED" },
      { restaurantId, partyName: "Later", partySize: 2, scheduledAt: new Date(now.getTime() + 3 * 3_600_000), assignedTableId: tables[1].id, status: "CONFIRMED" },
    ] });
    const snapshot = await (await writableManagerRepository()).loadSnapshot();
    expect(staffSeatingOptions(snapshot, { partySize: 2 }, now).map((option) => option.label)).toEqual(["T2"]);
    const detail = await fetchPublicRestaurantBySlug(client, "repository-test", now);
    const directory = (await fetchPublicRestaurants(client, now)).find((item) => item.restaurantId === restaurantId);
    expect(detail).toMatchObject({ availableTables: 1, availableSeatCapacity: 2, reservedTables: 1 });
    expect(directory).toMatchObject({ availableTables: 1, availableSeatCapacity: 2, reservedTables: 1 });
    expect(detail?.publicFloors[0].elements.map((table) => [table.label, table.status, table.upcomingReservations?.length])).toEqual([
      ["T1", "RESERVED", 1],
      ["T2", "AVAILABLE", 1],
    ]);
    await client.diningTable.update({ where: { id: tables[1].id }, data: { currentStatus: "RESERVED" } });
    const withLegacyHold = await fetchPublicRestaurantBySlug(client, "repository-test", now);
    expect(withLegacyHold?.publicFloors[0].elements[1]).toMatchObject({ label: "T2", status: "UNAVAILABLE" });
    expect(withLegacyHold).toMatchObject({ availableTables: 0, reservedTables: 1 });
  });

  it("completes a seated reservation by moving its whole table group to cleaning", async () => {
    const membership = await client.restaurantMembership.findUniqueOrThrow({
      where: {
        restaurantId_profileId: { restaurantId, profileId: ownerId },
      },
    });
    const tables = await client.diningTable.findMany({
      where: { restaurantId },
      orderBy: { label: "asc" },
    });
    const reservation = await client.reservation.create({
      data: {
        restaurantId,
        partyName: "Garcia",
        partySize: 5,
        scheduledAt: new Date(Date.now() + 60_000),
        status: "ARRIVED",
        createdById: ownerId,
      },
    });
    const repository = new PrismaOperationsRepository(client, {
      profileId: ownerId,
      restaurantId,
      membershipId: membership.id,
      membershipRole: membership.role,
    });
    await repository.execute({
      type: "SEAT_RESERVATION",
      commandId: "77777777-7777-4777-8777-777777777777",
      reservationId: reservation.id,
      expectedRevision: reservation.revision,
      tableIds: tables.map((table) => table.id),
    });
    const seated = await client.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    await repository.execute({
      type: "SET_RESERVATION_STATUS",
      commandId: "88888888-8888-4888-8888-888888888888",
      reservationId: reservation.id,
      expectedRevision: seated.revision,
      status: "COMPLETED",
    });

    expect(
      await client.diningTable.count({
        where: { restaurantId, currentStatus: "CLEANING" },
      }),
    ).toBe(2);
    expect(
      await client.diningSession.count({
        where: { reservationId: reservation.id, status: "CLEANING" },
      }),
    ).toBe(2);

    const cleaningTable = await client.diningTable.findFirstOrThrow({
      where: { restaurantId, currentStatus: "CLEANING" },
    });
    await repository.execute({
      type: "CORRECT_TABLE",
      commandId: "99999999-9999-4999-8999-999999999999",
      tableId: cleaningTable.id,
      expectedRevision: cleaningTable.statusRevision,
      reason: "Party is still dining",
    });
    expect(
      await client.diningTable.count({
        where: { restaurantId, currentStatus: "OCCUPIED" },
      }),
    ).toBe(2);
    expect(
      await client.diningSession.count({
        where: { reservationId: reservation.id, status: "ACTIVE" },
      }),
    ).toBe(2);
    expect(
      await client.reservation.findUniqueOrThrow({
        where: { id: reservation.id },
        select: { status: true, completedAt: true },
      }),
    ).toEqual({ status: "SEATED", completedAt: null });
  });

  it("approves and rejects pending reservations with revisions, tenancy, and idempotency", async () => {
    const membership = await client.restaurantMembership.findUniqueOrThrow({
      where: {
        restaurantId_profileId: { restaurantId, profileId: ownerId },
      },
    });
    const repository = new PrismaOperationsRepository(client, {
      profileId: ownerId,
      restaurantId,
      membershipId: membership.id,
      membershipRole: membership.role,
    });
    const [pendingApproval, pendingRejection, otherTenantReservation] =
      await Promise.all([
        client.reservation.create({
          data: {
            restaurantId,
            partyName: "Synthetic approval",
            partySize: 2,
            scheduledAt: new Date(Date.now() + 3 * 60 * 60_000),
            status: "PENDING_APPROVAL",
          },
        }),
        client.reservation.create({
          data: {
            restaurantId,
            partyName: "Synthetic rejection",
            partySize: 2,
            scheduledAt: new Date(Date.now() + 5 * 60 * 60_000),
            status: "PENDING_APPROVAL",
          },
        }),
        client.reservation.create({
          data: {
            restaurantId: otherRestaurantId,
            partyName: "Other tenant request",
            partySize: 2,
            scheduledAt: new Date(Date.now() + 7 * 60 * 60_000),
            status: "PENDING_APPROVAL",
          },
        }),
      ]);

    const approve = {
      type: "SET_RESERVATION_STATUS" as const,
      commandId: "12345678-1234-4234-8234-123456789abc",
      reservationId: pendingApproval.id,
      expectedRevision: pendingApproval.revision,
      status: "CONFIRMED" as const,
    };
    await repository.execute(approve);
    await repository.execute(approve);
    expect(
      await client.reservation.findUniqueOrThrow({
        where: { id: pendingApproval.id },
        select: { status: true, revision: true },
      }),
    ).toEqual({ status: "CONFIRMED", revision: 1 });
    expect(
      await client.operationCommand.count({ where: { id: approve.commandId } }),
    ).toBe(1);

    await expect(
      repository.execute({
        ...approve,
        commandId: "12345678-1234-4234-8234-123456789abd",
        status: "CANCELLED",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await repository.execute({
      type: "SET_RESERVATION_STATUS",
      commandId: "12345678-1234-4234-8234-123456789abe",
      reservationId: pendingRejection.id,
      expectedRevision: pendingRejection.revision,
      status: "CANCELLED",
    });
    expect(
      await client.reservation.findUniqueOrThrow({
        where: { id: pendingRejection.id },
        select: { status: true, cancelledAt: true },
      }),
    ).toMatchObject({ status: "CANCELLED", cancelledAt: expect.any(Date) });

    await expect(
      repository.execute({
        type: "SET_RESERVATION_STATUS",
        commandId: "12345678-1234-4234-8234-123456789abf",
        reservationId: otherTenantReservation.id,
        expectedRevision: otherTenantReservation.revision,
        status: "CONFIRMED",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      await client.reservation.findUniqueOrThrow({
        where: { id: otherTenantReservation.id },
        select: { status: true },
      }),
    ).toEqual({ status: "PENDING_APPROVAL" });
  });

  it("rejects assigning a reservation to another tenant's table", async () => {
    const membership = await client.restaurantMembership.findUniqueOrThrow({
      where: {
        restaurantId_profileId: { restaurantId, profileId: ownerId },
      },
    });
    const [reservation, privateTable] = await Promise.all([
      client.reservation.create({
        data: {
          restaurantId,
          partyName: "Tenant boundary",
          partySize: 2,
          scheduledAt: new Date(Date.now() + 4 * 60 * 60_000),
          createdById: ownerId,
        },
      }),
      client.diningTable.findFirstOrThrow({
        where: { restaurantId: otherRestaurantId },
      }),
    ]);
    const repository = new PrismaOperationsRepository(client, {
      profileId: ownerId,
      restaurantId,
      membershipId: membership.id,
      membershipRole: membership.role,
    });

    await expect(
      repository.execute({
        type: "UPDATE_RESERVATION",
        commandId: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
        reservationId: reservation.id,
        expectedRevision: reservation.revision,
        input: {
          partyName: reservation.partyName,
          partySize: reservation.partySize,
          scheduledAt: reservation.scheduledAt.toISOString(),
          tableId: privateTable.id,
        },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(
      await client.reservation.findUniqueOrThrow({
        where: { id: reservation.id },
        select: { assignedTableId: true },
      }),
    ).toEqual({ assignedTableId: null });
  });
});
