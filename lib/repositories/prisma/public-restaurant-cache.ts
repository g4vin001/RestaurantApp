import "server-only";

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  fetchPublicRestaurantBySlug,
  fetchPublicRestaurants,
} from "@/lib/repositories/prisma/public-restaurant-view";

export const PUBLIC_RESTAURANTS_CACHE_TAG = "public-restaurants";

// Public projections contain no account-specific data. A short shared cache
// keeps customer traffic from opening a Postgres query for every page view,
// while operations remain near-live and existing revalidatePath calls can
// invalidate the affected page immediately after writes.
export const getCachedPublicRestaurants = unstable_cache(
  async () => fetchPublicRestaurants(prisma),
  ["public-restaurants-v1"],
  {
    revalidate: 5,
    tags: [PUBLIC_RESTAURANTS_CACHE_TAG],
  },
);

export const getCachedPublicRestaurantBySlug = unstable_cache(
  async (slug: string) => fetchPublicRestaurantBySlug(prisma, slug),
  ["public-restaurant-by-slug-v1"],
  {
    revalidate: 5,
    tags: [PUBLIC_RESTAURANTS_CACHE_TAG],
  },
);
