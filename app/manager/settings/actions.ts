"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getActiveManagerMembership } from "@/lib/auth/manager-membership";
import {
  COVER_IMAGE_MAX_BYTES,
  publicCoverImageUrl,
  sniffCoverImageType,
} from "@/lib/customer/cover-image";
import { prisma } from "@/lib/prisma";
import { broadcastRestaurantInvalidation } from "@/lib/realtime/invalidation";
import { PUBLIC_RESTAURANTS_CACHE_TAG } from "@/lib/repositories/prisma/public-restaurant-cache";
import { reportDataError } from "@/lib/server/data-error";
import { createClient } from "@/lib/supabase/server";

type CoverImageResult =
  | { ok: true; coverImageUrl: string | null }
  | { ok: false; error: string };

async function managerRestaurant() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return getActiveManagerMembership(user.id);
}

function afterCoverChange(membership: NonNullable<Awaited<ReturnType<typeof managerRestaurant>>>) {
  revalidateTag(PUBLIC_RESTAURANTS_CACHE_TAG);
  revalidatePath("/manager", "layout");
  revalidatePath(`/restaurants/${membership.restaurant.slug}`);
  revalidatePath("/");
  broadcastRestaurantInvalidation(prisma, {
    restaurantId: membership.restaurantId,
    restaurantSlug: membership.restaurant.slug,
    environment: membership.restaurant.environment,
    entity: "restaurant",
    revision: crypto.randomUUID(),
  }).catch((error) => {
    reportDataError("realtime-invalidation", error);
  });
}

export async function uploadRestaurantCoverImage(formData: FormData): Promise<CoverImageResult> {
  try {
    const membership = await managerRestaurant();
    if (!membership) return { ok: false, error: "Please log in as a manager to change the restaurant photo." };

    const file = formData.get("image");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo to upload." };
    if (file.size > COVER_IMAGE_MAX_BYTES) return { ok: false, error: "That photo is too large. Try a smaller image." };

    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = sniffCoverImageType(bytes);
    if (!contentType) return { ok: false, error: "Upload a JPEG, PNG, or WebP photo." };

    const saved = await prisma.restaurantCoverImage.upsert({
      where: { restaurantId: membership.restaurantId },
      create: { restaurantId: membership.restaurantId, contentType, data: bytes },
      update: { contentType, data: bytes },
      select: { updatedAt: true },
    });
    afterCoverChange(membership);
    return { ok: true, coverImageUrl: publicCoverImageUrl(membership.restaurant.slug, saved.updatedAt) };
  } catch (error) {
    const reference = reportDataError("cover-image-upload", error);
    return { ok: false, error: `The photo could not be saved. Support reference: ${reference}` };
  }
}

export async function removeRestaurantCoverImage(): Promise<CoverImageResult> {
  try {
    const membership = await managerRestaurant();
    if (!membership) return { ok: false, error: "Please log in as a manager to change the restaurant photo." };
    await prisma.restaurantCoverImage.deleteMany({ where: { restaurantId: membership.restaurantId } });
    afterCoverChange(membership);
    return { ok: true, coverImageUrl: null };
  } catch (error) {
    const reference = reportDataError("cover-image-remove", error);
    return { ok: false, error: `The photo could not be removed. Support reference: ${reference}` };
  }
}
