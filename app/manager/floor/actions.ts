"use server";

import { revalidatePath } from "next/cache";
import { ensureProfile } from "@/lib/auth/profile";
import type { OperationsState } from "@/lib/domain/types";
import { prisma } from "@/lib/prisma";
import { OperationsRepositoryError } from "@/lib/repositories/operations";
import {
  publishFloorPlan,
  saveFloorPlanDraft,
  type FloorPlanMutationInput,
} from "@/lib/repositories/prisma/floor-plan-commands";
import { PrismaOperationsRepository } from "@/lib/repositories/prisma/prisma-operations";
import { getActiveManagerMembership } from "@/lib/auth/manager-membership";
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
    restaurantSlug: membership.restaurant.slug,
  };
}

async function runFloorPlanAction(
  input: FloorPlanMutationInput,
  command: (
    scope: { profileId: string; restaurantId: string },
    input: FloorPlanMutationInput,
  ) => Promise<void>,
): Promise<FloorPlanActionResult> {
  try {
    const scope = await managerScope();
    await command(scope, input);
    const state = await new PrismaOperationsRepository(prisma, scope).loadSnapshot();
    revalidatePath("/manager");
    revalidatePath(`/restaurants/${scope.restaurantSlug}`);
    revalidatePath("/");
    return { ok: true, state };
  } catch (error) {
    if (error instanceof OperationsRepositoryError) {
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error: "Halina could not save the floor plan. Please try again.",
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
