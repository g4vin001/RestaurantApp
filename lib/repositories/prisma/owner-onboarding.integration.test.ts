import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { createOwnedRestaurant } from "./owner-onboarding";
import { reviewRestaurantApplication, submitRestaurantApplication } from "./restaurant-applications";

const connectionString = process.env.HALINA_TEST_DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;
const ownerId = "11111111-1111-4111-8111-111111111111";

describeWithDatabase("owner onboarding repository", () => {
  let pool: Pool;
  let client: PrismaClient;

  beforeAll(() => {
    pool = new Pool({ connectionString });
    client = new PrismaClient({ adapter: new PrismaPg(pool) });
  });

  async function cleanOwnerFixture() {
    const memberships = await client.restaurantMembership.findMany({
      where: { profileId: ownerId },
      select: { restaurantId: true },
    });
    await client.restaurant.deleteMany({
      where: {
        id: { in: memberships.map((membership) => membership.restaurantId) },
      },
    });
    await client.profile.deleteMany({ where: { id: ownerId } });
  }

  beforeEach(async () => {
    await cleanOwnerFixture();
    await client.profile.create({
      data: {
        id: ownerId,
        email: "owner@example.com",
        displayName: "Owner",
      },
    });
  });

  afterAll(async () => {
    await cleanOwnerFixture();
    await client?.$disconnect();
    await pool?.end();
  });

  it("creates one restaurant, OWNER membership, and initial floor", async () => {
    const first = await createOwnedRestaurant(client, {
      profileId: ownerId,
      name: "Salu-Salo Kitchen",
      location: "Quezon City",
      slug: "salu-salo-kitchen-test",
    });
    const second = await createOwnedRestaurant(client, {
      profileId: ownerId,
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
          profileId: ownerId,
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
    expect(
      await client.restaurant.count({
        where: { memberships: { some: { profileId: ownerId } } },
      }),
    ).toBe(1);
  });

  it("only grants manager access after approval and allows a declined applicant to reapply", async () => {
    const reviewerId = "99999999-9999-4999-8999-999999999999";
    await client.profile.upsert({
      where: { id: reviewerId },
      create: { id: reviewerId, email: "onboarding-reviewer@example.com", displayName: "Reviewer" },
      update: {},
    });
    try {
      const details = { name: "Application Kitchen", location: "Quezon City", mapsUrl: "https://www.google.com/maps/place/Quezon+City" };
      await expect(submitRestaurantApplication(client, ownerId, details)).resolves.toMatchObject({ status: "PENDING" });
      expect(await client.restaurantMembership.count({ where: { profileId: ownerId } })).toBe(0);
      await expect(reviewRestaurantApplication(client, {
        applicantId: ownerId, reviewedById: reviewerId, decision: "DECLINED",
      })).resolves.toMatchObject({ status: "DECLINED", restaurantId: null });
      expect(await client.restaurantMembership.count({ where: { profileId: ownerId } })).toBe(0);
      await submitRestaurantApplication(client, ownerId, details);
      const approval = await reviewRestaurantApplication(client, {
        applicantId: ownerId, reviewedById: reviewerId, decision: "APPROVED",
      });
      expect(approval).toMatchObject({ status: "APPROVED", reviewedById: reviewerId });
      expect(await client.restaurantMembership.findFirst({ where: { profileId: ownerId } })).toMatchObject({
        role: "OWNER", restaurantId: approval.restaurantId, active: true,
      });
      await expect(reviewRestaurantApplication(client, {
        applicantId: ownerId, reviewedById: reviewerId, decision: "APPROVED",
      })).rejects.toMatchObject({ code: "CONFLICT" });
    } finally {
      await client.profile.deleteMany({ where: { id: reviewerId } });
    }
  });
});
