import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { legacyOperatingSchedule } from "@/lib/domain/restaurant-schedule";
import { approvalChecks } from "@/lib/restaurants/review";
import { createCustomerReservation, fetchCustomerReservations } from "./customer-reservations";
import { createCustomerWaitlistEntry } from "./customer-waitlist";
import { fetchPublicRestaurantBySlug, fetchPublicRestaurants } from "./public-restaurant-view";
import { getPublicationSetup, reviewRestaurantPublication, updateOwnerSetup } from "./restaurant-publication";
import { findPossibleRestaurantDuplicates, reviewRestaurantApplication, submitRestaurantApplication } from "./restaurant-applications";

const connectionString = process.env.HALINA_TEST_DATABASE_URL;
const testDatabase = connectionString ? describe : describe.skip;
const checks = Object.fromEntries(approvalChecks.map(([key]) => [key, true])) as Record<(typeof approvalChecks)[number][0], boolean>;

testDatabase("restaurant review and publication", () => {
  let pool: Pool;
  let client: PrismaClient;
  const restaurantIds: string[] = [];
  const profileIds: string[] = [];

  beforeAll(() => {
    pool = new Pool({ connectionString });
    client = new PrismaClient({ adapter: new PrismaPg(pool) });
  });

  afterAll(async () => {
    await client.restaurant.deleteMany({ where: { id: { in: restaurantIds } } });
    await client.profile.deleteMany({ where: { id: { in: profileIds } } });
    // Review events and their evidence are intentionally retained in the disposable database.
    await client.$disconnect();
    await pool.end();
  });

  async function profile(kind: string) {
    const id = randomUUID();
    const email = `${kind}-${id}@example.com`;
    profileIds.push(id);
    await client.profile.create({ data: { id, email, displayName: kind } });
    return { id, email, emailVerifiedAt: new Date() };
  }

  function submission(applicant: Awaited<ReturnType<typeof profile>>, name: string) {
    return {
      applicant,
      details: {
        name, address: "31 Test Avenue, Quezon City", mapsUrl: `https://www.google.com/maps/place/${name}`,
        phone: "+63 912 345 6789", businessEmail: applicant.email, applicantName: "Review Fixture",
        relationship: "OWNER" as const, website: null,
      },
      evidence: { filename: "authorization.pdf", contentType: "application/pdf" as const, content: new Uint8Array(Buffer.from("%PDF-test")) },
    };
  }

  it("serializes duplicate submissions, preserves revisions and provisions exactly once", async () => {
    const [applicant, other, actor] = await Promise.all([profile("applicant"), profile("other"), profile("admin")]);
    const input = submission(applicant, `Kitchen ${randomUUID()}`);
    const attempts = await Promise.allSettled([
      submitRestaurantApplication(client, input),
      submitRestaurantApplication(client, { ...input, applicant: other }),
    ]);
    expect(attempts.map((item) => item.status).sort()).toEqual(["fulfilled", "rejected"]);
    const winner = attempts[0].status === "fulfilled" ? applicant : other;
    const nonOwner = winner.id === applicant.id ? other : applicant;
    const first = attempts.find((item) => item.status === "fulfilled")!;
    const { id } = first.value;
    expect(await client.restaurantMembership.count({ where: { profileId: winner.id } })).toBe(0);

    const decide = (revision: number, decision: Parameters<typeof reviewRestaurantApplication>[1]["decision"]) =>
      reviewRestaurantApplication(client, { id, actor, revision, decision });
    await expect(decide(0, { action: "APPROVED", checks: { ...checks, authority: false } })).rejects.toThrow("verification");
    await decide(0, { action: "INFORMATION_REQUESTED", message: "Supply the authorization letter." });
    await expect(submitRestaurantApplication(client, {
      ...input, applicant: nonOwner, previous: { id, revision: 1 }, response: "Trying to edit another applicant’s record.",
    })).rejects.toThrow("changed");
    await decide(1, { action: "DECLINED", message: "The authorization was incomplete." });
    await expect(submitRestaurantApplication(client, {
      ...input, applicant: winner, previous: { id, revision: 2 }, evidence: null,
    })).rejects.toThrow("Attach proof");
    await submitRestaurantApplication(client, { ...input, applicant: winner, previous: { id, revision: 2 } });
    await decide(3, { action: "INFORMATION_REQUESTED", message: "Confirm the branch telephone number." });
    await submitRestaurantApplication(client, {
      ...input, applicant: winner, previous: { id, revision: 4 }, evidence: null, response: "The submitted phone is the branch line.",
    });

    const approvals = await Promise.allSettled([decide(5, { action: "APPROVED", checks }), decide(5, { action: "APPROVED", checks })]);
    expect(approvals.map((item) => item.status).sort()).toEqual(["fulfilled", "rejected"]);
    const application = await client.restaurantApplication.findUniqueOrThrow({ where: { id }, include: { restaurant: true, evidence: true } });
    restaurantIds.push(application.restaurantId!);
    expect(application.status).toBe("APPROVED");
    expect(application.evidence).toHaveLength(2);
    const restaurantId = application.restaurantId!;
    expect(application.restaurant?.lifecycle).toBe("SETUP");
    expect(await client.restaurantMembership.count({ where: { restaurantId, profileId: winner.id, role: "OWNER", active: true } })).toBe(1);
    expect(await client.floorPlan.count({ where: { restaurantId } })).toBe(1);
    expect(await client.staffRole.count({ where: { restaurantId } })).toBe(3);
    await expect(client.restaurantReviewEvent.updateMany({ where: { applicationId: id }, data: { message: "rewritten" } })).rejects.toThrow("append-only");
    await expect(client.restaurantReviewEvent.deleteMany({ where: { applicationId: id } })).rejects.toThrow("append-only");
    await expect(submitRestaurantApplication(client, { ...input, applicant: nonOwner })).rejects.toThrow("already has this name");
  });

  it("flags matching listings and blocks publication until an owner has completed setup", async () => {
    const [owner, guest, actor] = await Promise.all([profile("owner"), profile("guest"), profile("admin")]);
    const input = submission(owner, `Lifecycle Kitchen ${randomUUID()}`);
    const { id } = await submitRestaurantApplication(client, input);
    const candidate = await client.restaurant.create({ data: {
      name: input.details.name, location: "76 Other Avenue, Makati", slug: randomUUID(), lifecycle: "PUBLISHED",
    } });
    restaurantIds.push(candidate.id);
    const application = await client.restaurantApplication.findUniqueOrThrow({ where: { id } });
    const [similar] = await findPossibleRestaurantDuplicates(client, application);
    expect(similar).toContainEqual(expect.objectContaining({ id: candidate.id, exact: false }));
    await reviewRestaurantApplication(client, { actor, id, revision: 0, decision: { action: "APPROVED", checks } });
    const restaurant = await client.restaurant.findFirstOrThrow({ where: { application: { id } } });
    restaurantIds.push(restaurant.id);
    const restaurantId = restaurant.id;
    const booking = { restaurantId, customerProfileId: guest.id, partyName: "Guest booking", partySize: 2, scheduledAt: new Date("2026-11-28T11:00:00Z") };
    const waiting = { slug: restaurant.slug, profileId: guest.id, partyName: "Guest waitlist", partySize: 2, contact: "", promisedWaitMinutes: 10 };
    expect(await fetchPublicRestaurantBySlug(client, restaurant.slug)).toBeNull();
    await expect(createCustomerReservation(client, booking)).rejects.toThrow("no longer available");
    await expect(createCustomerWaitlistEntry(client, waiting)).rejects.toThrow("no longer available");
    await expect(updateOwnerSetup(client, guest, restaurantId, { action: "PUBLICATION_REQUESTED" })).rejects.toThrow("Only");
    await expect(updateOwnerSetup(client, owner, restaurantId, { action: "PUBLICATION_REQUESTED" })).rejects.toThrow("checklist");
    await expect(reviewRestaurantPublication(client, actor, restaurantId, restaurant.revision, { action: "PUBLISHED" })).rejects.toThrow("owner publication request");

    await client.restaurant.update({ where: { id: restaurantId }, data: { operatingSettings: { schedule: legacyOperatingSchedule(0, 24) } } });
    await updateOwnerSetup(client, owner, restaurantId, { action: "SERVICES", reservations: true, waitlist: false });
    const table = await client.diningTable.create({ data: { restaurantId, label: "T1", capacity: 4, maxPartySize: 4, shape: "ROUND" } });
    const floor = await client.floorPlan.findFirstOrThrow({ where: { restaurantId } });
    const version = await client.floorPlanVersion.create({ data: {
      floorPlanId: floor.id, name: floor.name, version: 1, logicalWidth: 1600, logicalHeight: 1000, publishedAt: new Date(),
      elements: { create: { stableElementId: randomUUID(), diningTableId: table.id, type: "TABLE", x: 10, y: 10, width: 50, height: 50, shape: "ROUND" } },
    } });
    await client.floorPlan.update({ where: { id: floor.id }, data: { activeVersionId: version.id } });
    expect(await getPublicationSetup(client, restaurantId)).toMatchObject({ ready: true });
    await updateOwnerSetup(client, owner, restaurantId, { action: "PUBLICATION_REQUESTED" });
    async function review(change: Parameters<typeof reviewRestaurantPublication>[4]) {
      const { revision } = await client.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
      return reviewRestaurantPublication(client, actor, restaurantId, revision, change);
    }
    await review({ action: "PUBLISHED" });
    expect(await fetchPublicRestaurants(client)).toContainEqual(expect.objectContaining({ slug: restaurant.slug }));
    await expect(createCustomerWaitlistEntry(client, waiting)).rejects.toThrow("turned off");
    const { reservationId } = await createCustomerReservation(client, booking);
    await updateOwnerSetup(client, owner, restaurantId, { action: "SERVICES", waitlist: true });
    const queue = await createCustomerWaitlistEntry(client, waiting);
    expect(await createCustomerWaitlistEntry(client, waiting)).toEqual(queue);

    await review({ action: "SUSPENDED", message: "Temporarily suspended for review." });
    expect(await fetchPublicRestaurantBySlug(client, restaurant.slug)).toBeNull();
    await expect(createCustomerReservation(client, booking)).rejects.toThrow("no longer available");
    await expect(createCustomerWaitlistEntry(client, waiting)).rejects.toThrow("no longer available");
    expect(await fetchCustomerReservations(client, guest.id)).toContainEqual(expect.objectContaining({ id: reservationId }));
    expect(await client.queueEntry.findUnique({ where: { id: queue.id } })).toMatchObject({ status: "WAITING" });
    await review({ action: "RESTORED", message: "Review resolved." });
    expect(await fetchPublicRestaurantBySlug(client, restaurant.slug)).toMatchObject({ slug: restaurant.slug });
  });

  it("denies evidence reads and audit writes to Supabase browser roles", async () => {
    for (const role of ["anon", "authenticated"]) {
      const connection = await pool.connect();
      try {
        await connection.query("BEGIN");
        await connection.query(role === "anon" ? "SET LOCAL ROLE anon" : "SET LOCAL ROLE authenticated");
        const granted = await connection.query(`
          SELECT has_table_privilege('public."RestaurantApplicationEvidence"', 'SELECT') AS "evidence",
                 has_table_privilege('public."RestaurantReviewEvent"', 'INSERT') AS "history"
        `);
        expect(granted.rows).toEqual([{ evidence: false, history: false }]);
      } finally {
        await connection.query("ROLLBACK");
        connection.release();
      }
    }
  });
});
