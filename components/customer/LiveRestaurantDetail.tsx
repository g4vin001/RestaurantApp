import Link from "next/link";
import { PageCard } from "@/components/PageCard";
import { StatusBadge } from "@/components/StatusBadge";
import { formatLastUpdated } from "@/lib/helpers";
import type { PublicRestaurantView } from "@/lib/repositories/prisma/public-restaurant-view";

export function LiveRestaurantDetail({
  restaurant,
  slug,
}: {
  restaurant: PublicRestaurantView;
  slug: string;
}) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-sm text-stone-500">
        {restaurant.cuisineType ? `${restaurant.cuisineType} · ${restaurant.location}` : restaurant.location}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{restaurant.name}</h1>
        <StatusBadge status={restaurant.walkInStatus} />
      </div>
      <div className="mt-7 grid gap-4 sm:grid-cols-3">
        <PageCard>
          <b>{restaurant.estimatedWaitMinutes} min</b>
          <p className="text-sm text-stone-500">estimated wait</p>
        </PageCard>
        <PageCard>
          <b>{restaurant.groupsWaiting}</b>
          <p className="text-sm text-stone-500">groups in queue</p>
        </PageCard>
        <PageCard>
          <b>
            {restaurant.availableTables} of {restaurant.activeTables}
          </b>
          <p className="text-sm text-stone-500">tables available</p>
        </PageCard>
      </div>
      <PageCard className="mt-5">
        <p className="text-sm text-stone-500">
          Last updated {formatLastUpdated(restaurant.lastUpdatedAt)}
        </p>
        {restaurant.stale && (
          <p className="mt-2 text-sm font-medium text-amber-700">
            Live information may be a few minutes old.
          </p>
        )}
      </PageCard>
      <Link
        href={`/restaurants/${slug}/book`}
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900"
      >
        Book a table
      </Link>
    </main>
  );
}
