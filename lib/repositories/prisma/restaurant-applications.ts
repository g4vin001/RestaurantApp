import "server-only";
import { randomUUID } from "node:crypto";
import { createRestaurantSlug, type readApplicationEvidence, type validateRestaurantApplication } from "@/lib/auth/restaurant-onboarding";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import type { RestaurantApplicationStatus } from "@/lib/generated/prisma/enums";
import { approvalChecks, RestaurantReviewError } from "@/lib/restaurants/review";
import { provisionRestaurant } from "./admin-restaurants";
import { assertNoLiveListing, lockBusinessIdentity, restaurantBusinessKey } from "./restaurant-business-identity";

export type ReviewActor = { id: string; email: string };
type ApplicationDetails = ReturnType<typeof validateRestaurantApplication>;
type ApplicationEvidence = NonNullable<Awaited<ReturnType<typeof readApplicationEvidence>>>;
type Applicant = ReviewActor & { emailVerifiedAt: Date };

function lockedApplication(tx: Prisma.TransactionClient, id: string, applicantId?: string) {
  return tx.$queryRaw`
    SELECT "id" FROM "RestaurantApplication" WHERE "id" = ${id}::uuid
    ${applicantId ? Prisma.sql`AND "applicantId" = ${applicantId}::uuid` : Prisma.empty}
    FOR UPDATE
  `;
}

async function hasManagerMembership(tx: Prisma.TransactionClient, profileId: string) {
  return tx.restaurantMembership.findFirst({
    where: { profileId, active: true, role: { in: ["OWNER", "MANAGER"] }, restaurant: { archivedAt: null } },
    select: { id: true },
  });
}

export async function submitRestaurantApplication(client: PrismaClient, input: {
  applicant: Applicant;
  previous?: { id: string; revision: number };
  details: ApplicationDetails;
  evidence: ApplicationEvidence | null;
  response?: string;
}) {
  try {
    return await client.$transaction(async (tx) => {
      const { applicant, details, evidence, previous, response } = input;
      // Serialize first submissions and corrections from one account, even
      // when competing requests supply different restaurant identities.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${applicant.id}, 47202))`;
      if (previous) await lockedApplication(tx, previous.id, applicant.id);
      const latest = await tx.restaurantApplication.findFirst({
        where: { applicantId: applicant.id },
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        select: { id: true, status: true, revision: true, _count: { select: { evidence: true } } },
      });
      if (latest?.id !== previous?.id || latest?.revision !== previous?.revision) {
        throw new RestaurantReviewError("This application changed. Refresh the page to see its latest status.");
      }
      if (latest && latest.status !== "DECLINED" && latest.status !== "NEEDS_INFORMATION") {
        throw new RestaurantReviewError("This application is already under review or approved.");
      }
      if ((!latest?._count.evidence || latest.status === "DECLINED") && !evidence) {
        throw new RestaurantReviewError("Attach proof of business ownership or authorization.");
      }
      if (latest?.status === "NEEDS_INFORMATION" && !response) {
        throw new RestaurantReviewError("Describe how you addressed the reviewer’s request.");
      }
      if (await hasManagerMembership(tx, applicant.id)) {
        throw new RestaurantReviewError("This account already has a restaurant management workspace.");
      }

      const businessKey = await restaurantBusinessKey(tx, details.name, details.address);
      await lockBusinessIdentity(tx, businessKey);
      await assertNoLiveListing(tx, businessKey);
      const fields = { ...details, businessKey, applicantEmail: applicant.email, emailVerifiedAt: applicant.emailVerifiedAt };
      const application = latest
        ? await tx.restaurantApplication.update({
            where: { id: latest.id },
            data: { ...fields, status: "PENDING", reviewedAt: null, reviewedById: null, revision: { increment: 1 } },
            select: { id: true },
          })
        : await tx.restaurantApplication.create({
            data: { ...fields, applicantId: applicant.id },
            select: { id: true },
          });
      const document = evidence ? await tx.restaurantApplicationEvidence.create({
        data: { ...evidence, applicationId: application.id },
        select: { id: true, filename: true },
      }) : null;

      await tx.restaurantReviewEvent.create({
        data: {
          applicationId: application.id,
          action: latest ? "RESUBMITTED" : "SUBMITTED",
          actorId: applicant.id,
          actorEmail: applicant.email,
          fromStatus: latest?.status,
          toStatus: "PENDING",
          message: response,
          details: { ...details, emailVerifiedAt: applicant.emailVerifiedAt.toISOString(), evidence: document },
        },
      });
      return application;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new RestaurantReviewError("An application for this restaurant or account is already open. Contact Halina support if you need help.");
    }
    throw error;
  }
}

type ReviewDecision =
  | { action: "APPROVED"; checks: Record<(typeof approvalChecks)[number][0], boolean> }
  | { action: "DECLINED" | "INFORMATION_REQUESTED" | "NOTE_ADDED"; message: string };

export async function reviewRestaurantApplication(client: PrismaClient, input: {
  actor: ReviewActor;
  id: string;
  revision: number;
  decision: ReviewDecision;
}) {
  return client.$transaction(async (tx) => {
    const { id, actor, decision, revision } = input;
    await lockedApplication(tx, id);
    const application = await tx.restaurantApplication.findUnique({
      where: { id },
      include: { _count: { select: { evidence: true } } },
    });
    if (!application || application.revision !== revision) {
      throw new RestaurantReviewError("This application changed. Refresh the page to see its latest status.");
    }
    const { status, applicantId } = application;
    const mayDecline = decision.action === "DECLINED" && status === "NEEDS_INFORMATION";
    if (decision.action !== "NOTE_ADDED" && status !== "PENDING" && !mayDecline) {
      throw new RestaurantReviewError("Only pending applications can be decided. Wait for the applicant’s reply if information was requested.");
    }

    let restaurantId = application.restaurantId;
    let nextStatus = status;
    if (decision.action === "APPROVED") {
      if (!approvalChecks.every(([key]) => decision.checks[key] === true)) {
        throw new RestaurantReviewError("Complete every verification check before approving.");
      }
      if (!applicantId || !application.emailVerifiedAt || !application._count.evidence || !application.businessKey) {
        throw new RestaurantReviewError("Approval requires an active applicant record, verified email, and supporting evidence.");
      }
      if (await hasManagerMembership(tx, applicantId)) {
        throw new RestaurantReviewError("The applicant already holds an active management membership.");
      }
      await lockBusinessIdentity(tx, application.businessKey);
      await assertNoLiveListing(tx, application.businessKey);
      const restaurant = await provisionRestaurant(tx, {
        ownerId: applicantId,
        name: application.name,
        location: application.address,
        slug: createRestaurantSlug(application.name, randomUUID().slice(0, 8)),
      });
      restaurantId = restaurant.restaurantId;
      nextStatus = "APPROVED";
    } else if (decision.action !== "NOTE_ADDED") {
      nextStatus = decision.action === "DECLINED" ? "DECLINED" : "NEEDS_INFORMATION";
    }

    await tx.restaurantApplication.update({
      where: { id },
      data: {
        status: nextStatus, restaurantId, revision: { increment: 1 },
        ...(decision.action === "NOTE_ADDED" ? {} : { reviewedAt: new Date(), reviewedById: actor.id }),
      },
    });
    const event = await tx.restaurantReviewEvent.create({
      data: {
        applicationId: id, restaurantId, actorId: actor.id, actorEmail: actor.email,
        action: decision.action, fromStatus: status, toStatus: nextStatus,
        message: "message" in decision ? decision.message : undefined,
        details: decision.action === "APPROVED" ? {
          automatic: { emailVerifiedAt: application.emailVerifiedAt?.toISOString(), mapsUrlValidated: true },
          administratorChecks: decision.checks,
        } : undefined,
        toLifecycle: decision.action === "APPROVED" ? "SETUP" : undefined,
      },
      select: { id: true },
    });
    return { eventId: event.id, applicantEmail: applicantId ? application.applicantEmail : null };
  });
}

export async function findPossibleRestaurantDuplicates(client: PrismaClient, application: {
  id: string;
  restaurantId: string | null;
  name: string;
  address: string;
  businessKey: string | null;
  mapsUrl: string;
  phone: string;
  businessEmail: string;
}) {
  return Promise.all([
    client.$queryRaw<Array<{ id: string; name: string; location: string; exact: boolean }>>`
      SELECT "id", "name", "location",
        private.halina_business_identity("name", "location") = private.halina_business_identity(${application.name}, ${application.address}) AS "exact"
      FROM "Restaurant"
      WHERE "environment" = 'LIVE' AND "archivedAt" IS NULL
        ${application.restaurantId ? Prisma.sql`AND "id" <> ${application.restaurantId}::uuid` : Prisma.empty}
        AND (private.halina_business_identity("name", "location") = private.halina_business_identity(${application.name}, ${application.address})
          OR lower("name") = lower(${application.name}) OR lower("location") = lower(${application.address}))
      ORDER BY "exact" DESC, "name" ASC LIMIT 15
    `,
    client.$queryRaw<Array<{ id: string; name: string; status: RestaurantApplicationStatus }>>`
      SELECT "id", "name", "status" FROM "RestaurantApplication"
      WHERE "id" <> ${application.id}::uuid AND "status" <> 'DECLINED'
        AND ("businessKey" = ${application.businessKey} OR lower("name") = lower(${application.name}) OR lower("location") = lower(${application.address})
          OR "mapsUrl" = ${application.mapsUrl} OR "businessEmail" = ${application.businessEmail}
          OR regexp_replace("phone", '[^0-9]', '', 'g') = ${application.phone.replace(/\D/g, "")})
      ORDER BY "submittedAt" DESC LIMIT 15
    `,
  ]);
}
