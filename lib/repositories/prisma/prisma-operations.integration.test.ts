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
const restaurantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherRestaurantId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describeWithDatabase("Prisma operations repository", () => {
  let pool: Pool;
  let client: PrismaClient;

  beforeAll(() => {
    pool = new Pool({ connectionString });
    client = new PrismaClient({ adapter: new PrismaPg(pool) });
  });

  beforeEach(async () => {
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
          create: {
            label: "T1",
            capacity: 4,
            minPartySize: 2,
            maxPartySize: 5,
            zone: "Main",
            shape: "RECTANGLE",
          },
        },
        queueEntries: {
          create: {
            partyName: "Reyes",
            partySize: 3,
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
    expect(snapshot.tables.map((table) => table.label)).toEqual(["T1"]);
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
});
