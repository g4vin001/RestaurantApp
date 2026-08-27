"use server";

import { revalidatePath } from "next/cache";
import { ensureProfile } from "@/lib/auth/profile";
import type { OperationsState } from "@/lib/domain/types";
import { prisma } from "@/lib/prisma";
import { OperationsRepositoryError } from "@/lib/repositories/operations";
import {
  createFloorPlan,
  publishFloorPlan,
  restoreFloorPlanVersion,
  saveFloorPlanDraft,
  type FloorPlanMutationInput,
} from "@/lib/repositories/prisma/floor-plan-commands";
import { PrismaOperationsRepository } from "@/lib/repositories/prisma/prisma-operations";
import { getActiveManagerMembership } from "@/lib/auth/manager-membership";
import { broadcastRestaurantInvalidation } from "@/lib/realtime/invalidation";
import { reportDataError } from "@/lib/server/data-error";
import { createClient } from "@/lib/supabase/server";

export type FloorPlanActionResult =
  | { ok: true; state: OperationsState }
  | { ok: false; error: string };

async function managerScope() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    throw new OperationsRepositoryError("UNAUTHORIZED", "Please log in again.");
  await ensureProfile(user);
  const membership = await getActiveManagerMembership(user.id);
  if (!membership) {
    throw new OperationsRepositoryError(
      "FORBIDDEN",
      "You do not have manager access to a restaurant.",
    );
  }
  return {
    profileId: user.id,
    restaurantId: membership.restaurantId,
    membershipId: membership.id,
    membershipRole: membership.role,
    restaurantSlug: membership.restaurant.slug,
    environment: membership.restaurant.environment,
  };
}

async function finishFloorMutation(
  scope: Awaited<ReturnType<typeof managerScope>>,
  revision: string,
) {
  revalidatePath("/manager", "layout");
  revalidatePath(`/restaurants/${scope.restaurantSlug}`);
  revalidatePath("/");
  await broadcastRestaurantInvalidation(prisma, {
    restaurantId: scope.restaurantId,
    restaurantSlug: scope.restaurantSlug,
    environment: scope.environment,
    entity: "floor",
    revision,
  }).catch((error) => reportDataError("floor-realtime-invalidation", error));
}

async function runFloorPlanAction(
  input: FloorPlanMutationInput,
  command: (
    scope: Awaited<ReturnType<typeof managerScope>>,
    input: FloorPlanMutationInput,
  ) => Promise<void>,
): Promise<FloorPlanActionResult> {
  try {
    const scope = await managerScope();
    await command(scope, input);
    const state = await new PrismaOperationsRepository(prisma, scope).loadSnapshot();
    await finishFloorMutation(scope, input.commandId);
    return { ok: true, state };
  } catch (error) {
    if (error instanceof OperationsRepositoryError) {
      return { ok: false, error: error.message };
    }
    const reference = reportDataError("floor-plan-command", error);
    return {
      ok: false,
      error: `Halina could not save the floor plan. Support reference: ${reference}`,
    };
  }
}

export async function saveFloorPlanDraftAction(input: FloorPlanMutationInput) {
  return await runFloorPlanAction(input, (scope, nextInput) =>
    saveFloorPlanDraft(prisma, scope, nextInput),
  );
}

export async function publishFloorPlanAction(input: FloorPlanMutationInput) {
  return await runFloorPlanAction(input, (scope, nextInput) =>
    publishFloorPlan(prisma, scope, nextInput),
  );
}

export async function createFloorPlanAction(name: string, commandId: string): Promise<
  | { ok: true; state: OperationsState; planId: string }
  | { ok: false; error: string }
> {
  try {
    const scope = await managerScope();
    const created = await createFloorPlan(prisma, scope, name, commandId);
    const state = await new PrismaOperationsRepository(prisma, scope).loadSnapshot();
    await finishFloorMutation(scope, commandId);
    return { ok: true, state, planId: created.id };
  } catch (error) {
    if (error instanceof OperationsRepositoryError) {
      return { ok: false, error: error.message };
    }
    const reference = reportDataError("floor-plan-create", error);
    return {
      ok: false,
      error: `Halina could not create the floor plan. Support reference: ${reference}`,
    };
  }
}

export async function restoreFloorPlanVersionAction(input: {
  commandId: string;
  planId: string;
  versionId: string;
  expectedRevision: number;
}): Promise<FloorPlanActionResult> {
  try {
    const scope = await managerScope();
    await restoreFloorPlanVersion(prisma, scope, input);
    const state = await new PrismaOperationsRepository(prisma, scope).loadSnapshot();
    await finishFloorMutation(scope, input.commandId);
    return { ok: true, state };
  } catch (error) {
    if (error instanceof OperationsRepositoryError) {
      return { ok: false, error: error.message };
    }
    const reference = reportDataError("floor-plan-restore", error);
    return {
      ok: false,
      error: `Halina could not restore that floor version. Support reference: ${reference}`,
    };
  }
}
