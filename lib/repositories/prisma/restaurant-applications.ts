import "server-only";

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { createRestaurantSlug } from "@/lib/auth/restaurant-onboarding";
import { OperationsRepositoryError } from "@/lib/repositories/operations";
import { createOwnedRestaurantInTransaction } from "./owner-onboarding";

export async function submitRestaurantApplication(
  client: PrismaClient,
  applicantId: string,
  input: { name: string; location: string; mapsUrl: string },
) {
  return client.$transaction(async (tx) => {
    const existing = await tx.restaurantApplication.findUnique({ where: { applicantId } });
    if (!existing) {
      return tx.restaurantApplication.create({ data: { applicantId, ...input } });
    }
    if (existing.status !== "DECLINED") return existing;

    return tx.restaurantApplication.update({
      where: { applicantId },
      data: { ...input, status: "PENDING", submittedAt: new Date(), reviewedAt: null, reviewedById: null },
    });
  }, { isolationLevel: "Serializable" });
}

export async function reviewRestaurantApplication(
  client: PrismaClient,
  input: { applicantId: string; reviewedById: string; decision: "APPROVED" | "DECLINED" },
) {
  return client.$transaction(async (tx) => {
    const application = await tx.restaurantApplication.findUnique({ where: { applicantId: input.applicantId } });
    if (!application || application.status !== "PENDING") {
      throw new OperationsRepositoryError("CONFLICT", "This application has already been reviewed.");
    }
    let restaurantId: string | null = null;
    if (input.decision === "APPROVED") {
      const result = await createOwnedRestaurantInTransaction(tx, {
        profileId: application.applicantId,
        name: application.name,
        location: application.location,
        slug: createRestaurantSlug(application.name, randomUUID().slice(0, 8)),
      });
      if (!result.created) {
        throw new OperationsRepositoryError("CONFLICT", "The applicant already manages a restaurant.");
      }
      restaurantId = result.restaurantId;
    }

    return tx.restaurantApplication.update({
      where: { applicantId: input.applicantId, status: "PENDING" },
      data: { status: input.decision, reviewedAt: new Date(), reviewedById: input.reviewedById, restaurantId },
    });
  }, { isolationLevel: "Serializable" });
}
