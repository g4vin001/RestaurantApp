import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { OperationsRepositoryError } from "@/lib/repositories/operations";
import { PrismaOperationsRepository } from "./prisma-operations";

const connectionString = process.env.HALINA_TEST_DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

const ownerId = "33333333-3333-4333-8333-333333333333";
const otherOwnerId = "44444444-4444-4444-8444-444444444444";
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

  beforeEach(async () => {
    await client.seatingAssignment.deleteMany({
      where: { restaurantId: { in: [restaurantId, otherRestaurantId] } },
    });
    await client.restaurant.deleteMany({
      where: { id: { in: [restaurantId, otherRestaurantId] } },
    });
    await client.profile.deleteMany({
      where: { id: { in: [ownerId, otherOwnerId] } },
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
      ],
    });
    await client.restaurant.create({
      data: {
        id: restaurantId,
        slug: "repository-test",
        name: "Repository Test Kitchen",
        location: "Quezon City",
        operatingSettings: {
          opensAtHour: 9,
          closesAtHour: 23,
          cleaningTargetMinutes: 14,
        },
        memberships: { create: { profileId: ownerId, role: "OWNER" } },
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
      where: { id: { in: [ownerId, otherOwnerId] } },
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

  it("denies a restaurant outside the manager's membership", async () => {
    const repository = new PrismaOperationsRepository(client, {
      profileId: ownerId,
      restaurantId: otherRestaurantId,
    });

    await expect(repository.loadSnapshot()).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<OperationsRepositoryError>);
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
