import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { createOwnedRestaurant } from "./owner-onboarding";

const connectionString = process.env.HALINA_TEST_DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase("owner onboarding repository", () => {
  let pool: Pool;
  let client: PrismaClient;

  beforeAll(() => {
    pool = new Pool({ connectionString });
    client = new PrismaClient({ adapter: new PrismaPg(pool) });
  });

  beforeEach(async () => {
    await client.floorPlan.deleteMany();
    await client.restaurantMembership.deleteMany();
    await client.restaurant.deleteMany();
    await client.profile.deleteMany();
    await client.profile.create({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "owner@example.com",
        displayName: "Owner",
      },
    });
  });

  afterAll(async () => {
    await client?.$disconnect();
    await pool?.end();
  });

  it("creates one restaurant, OWNER membership, and initial floor", async () => {
    const first = await createOwnedRestaurant(client, {
      profileId: "11111111-1111-4111-8111-111111111111",
      name: "Salu-Salo Kitchen",
      location: "Quezon City",
      slug: "salu-salo-kitchen-test",
    });
    const second = await createOwnedRestaurant(client, {
      profileId: "11111111-1111-4111-8111-111111111111",
      name: "Ignored duplicate",
      location: "Makati",
      slug: "ignored-duplicate-test",
    });

    expect(first.created).toBe(true);
    expect(second).toMatchObject({
      created: false,
      restaurantId: first.restaurantId,
    });
    expect(
      await client.restaurantMembership.count({
        where: {
          profileId: "11111111-1111-4111-8111-111111111111",
          role: "OWNER",
          active: true,
        },
      }),
    ).toBe(1);
    expect(
      await client.floorPlan.count({
        where: { restaurantId: first.restaurantId },
      }),
    ).toBe(1);
    expect(await client.restaurant.count()).toBe(1);
  });
});
