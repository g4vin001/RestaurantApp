"use server";

import { revalidatePath } from "next/cache";
import { getActiveManagerMembership } from "@/lib/auth/manager-membership";
import { ensureProfile } from "@/lib/auth/profile";
import type {
  DatabaseOperationsCommand,
  OperationsCommandResult,
} from "@/lib/repositories/commands";
import { prisma } from "@/lib/prisma";
import { broadcastRestaurantInvalidation } from "@/lib/realtime/invalidation";
import { OperationsRepositoryError } from "@/lib/repositories/operations";
import { PrismaOperationsRepository } from "@/lib/repositories/prisma/prisma-operations";
import { reportDataError } from "@/lib/server/data-error";
import { createClient } from "@/lib/supabase/server";

function entityForCommand(command: DatabaseOperationsCommand) {
  if (command.type.includes("QUEUE")) return "queue" as const;
  if (command.type.includes("RESERVATION")) return "reservation" as const;
  if (command.type.includes("STAFF")) return "staff" as const;
  if (command.type.includes("TABLE") || command.type === "CORRECT_TABLE") return "table" as const;
  return "restaurant" as const;
}

export async function runManagerCommand(
  command: DatabaseOperationsCommand,
): Promise<OperationsCommandResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, code: "UNAUTHORIZED", error: "Please log in again." };
    await ensureProfile(user);
    const membership = await getActiveManagerMembership(user.id);
    if (!membership) {
      return { ok: false, code: "FORBIDDEN", error: "You do not have manager access to a restaurant." };
    }

    const repository = new PrismaOperationsRepository(prisma, {
      profileId: user.id,
      restaurantId: membership.restaurantId,
      membershipId: membership.id,
      membershipRole: membership.role,
    });
    const state = await repository.execute(command);

    revalidatePath("/manager", "layout");
    revalidatePath(`/restaurants/${membership.restaurant.slug}`);
    revalidatePath("/");

    broadcastRestaurantInvalidation(prisma, {
      restaurantId: membership.restaurantId,
      restaurantSlug: membership.restaurant.slug,
      environment: state.restaurant.environment ?? "LIVE",
      entity: entityForCommand(command),
      revision: command.commandId,
    }).catch((error) => {
      reportDataError("realtime-invalidation", error);
    });

    return { ok: true, state };
  } catch (error) {
    if (error instanceof OperationsRepositoryError) {
      return { ok: false, code: error.code, error: error.message };
    }
    const reference = reportDataError("manager-command", error);
    return {
      ok: false,
      code: "PERSISTENCE",
      error: `Halina could not save this change. Support reference: ${reference}`,
    };
  }
}

export async function loadManagerSnapshotAction(): Promise<OperationsCommandResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, code: "UNAUTHORIZED", error: "Please log in again." };
    const membership = await getActiveManagerMembership(user.id);
    if (!membership) return { ok: false, code: "FORBIDDEN", error: "Restaurant access is no longer active." };
    const state = await new PrismaOperationsRepository(prisma, {
      profileId: user.id,
      restaurantId: membership.restaurantId,
      membershipId: membership.id,
      membershipRole: membership.role,
    }).loadSnapshot();
    return { ok: true, state };
  } catch (error) {
    const reference = reportDataError("manager-refresh", error);
    return { ok: false, code: "PERSISTENCE", error: `Halina could not refresh shared data. Support reference: ${reference}` };
  }
}
