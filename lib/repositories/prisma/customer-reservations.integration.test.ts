import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { OperationsRepositoryError } from "@/lib/repositories/operations";
import { createCustomerReservation } from "./customer-reservations";

const connectionString = process.env.HALINA_TEST_DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

const restaurantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const customerAId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const customerBId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

// Two tables totaling capacity 6 — small and deterministic on purpose.
const TOTAL_CAPACITY = 6;

describeWithDatabase("customer reservation booking", () => {
  let pool: Pool;
  let client: PrismaClient;

  beforeAll(() => {
    pool = new Pool({ connectionString });
    client = new PrismaClient({ adapter: new PrismaPg(pool) });
  });

  async function cleanFixture() {
    await client.restaurant.deleteMany({ where: { id: restaurantId } });
    await client.profile.deleteMany({
      where: { id: { in: [customerAId, customerBId] } },
    });
  }

  beforeEach(async () => {
    await cleanFixture();
    await client.profile.createMany({
      data: [
        { id: customerAId, email: "customer-a@example.com", displayName: "Customer A" },
        { id: customerBId, email: "customer-b@example.com", displayName: "Customer B" },
      ],
    });
    await client.restaurant.create({
      data: {
        id: restaurantId,
        slug: "reservation-test-restaurant",
        name: "Reservation Test Restaurant",
        diningTables: {
          create: [
            { label: "T1", capacity: 4, maxPartySize: 4, shape: "SQUARE" },
            { label: "T2", capacity: 2, maxPartySize: 2, shape: "ROUND" },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await cleanFixture();
    await client?.$disconnect();
    await pool?.end();
  });

  const scheduledAt = new Date("2026-09-01T19:00:00.000Z");

  it("books a reservation under capacity and links it to the customer", async () => {
    const result = await createCustomerReservation(client, {
      restaurantId,
      customerProfileId: customerAId,
      partyName: "Cruz family",
      partySize: 4,
      scheduledAt,
    });

    const reservation = await client.reservation.findUniqueOrThrow({
      where: { id: result.reservationId },
    });
    expect(reservation.customerProfileId).toBe(customerAId);
    expect(reservation.createdById).toBeNull();
    expect(reservation.status).toBe("PENDING_APPROVAL");
  });

  it("rejects a booking that would exceed total capacity in the overlap window", async () => {
    await createCustomerReservation(client, {
      restaurantId,
      customerProfileId: customerAId,
      partyName: "Cruz family",
      partySize: 4,
      scheduledAt,
    });

    await expect(
      createCustomerReservation(client, {
        restaurantId,
        customerProfileId: customerBId,
        partyName: "Reyes family",
        partySize: 3,
        scheduledAt: new Date(scheduledAt.getTime() + 30 * 60_000),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" } satisfies Partial<OperationsRepositoryError>);
  });

  it("allows a booking outside the 90-minute overlap window even at full capacity", async () => {
    await createCustomerReservation(client, {
      restaurantId,
      customerProfileId: customerAId,
      partyName: "Cruz family",
      partySize: TOTAL_CAPACITY,
      scheduledAt,
    });

    const later = await createCustomerReservation(client, {
      restaurantId,
      customerProfileId: customerBId,
      partyName: "Reyes family",
      partySize: 2,
      scheduledAt: new Date(scheduledAt.getTime() + 3 * 60 * 60_000),
    });

    expect(later.reservationId).toBeTruthy();
  });

  it("under real concurrent contention, exactly one of two conflicting bookings succeeds", async () => {
    const results = await Promise.allSettled([
      createCustomerReservation(client, {
        restaurantId,
        customerProfileId: customerAId,
        partyName: "Cruz family",
        partySize: 4,
        scheduledAt,
      }),
      createCustomerReservation(client, {
        restaurantId,
        customerProfileId: customerBId,
        partyName: "Reyes family",
        partySize: 4,
        scheduledAt,
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: "CONFLICT",
    } satisfies Partial<OperationsRepositoryError>);

    const totalBooked = await client.reservation.aggregate({
      where: { restaurantId, status: "PENDING_APPROVAL" },
      _sum: { partySize: true },
    });
    expect(totalBooked._sum.partySize).toBeLessThanOrEqual(TOTAL_CAPACITY);
  });
});
