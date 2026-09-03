import Link from "next/link";
import { PageCard } from "@/components/PageCard";
import { StatusBadge } from "@/components/StatusBadge";
import { formatLastUpdated } from "@/lib/helpers";
import type { PublicRestaurantView } from "@/lib/repositories/prisma/public-restaurant-view";

export function RestaurantCard({ restaurant }: { restaurant: PublicRestaurantView }) {
  return (
    <PageCard>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">{restaurant.name}</h2>
          <p className="text-sm text-stone-500">
            {restaurant.cuisineType ? `${restaurant.cuisineType} · ${restaurant.location}` : restaurant.location}
          </p>
        </div>
        <StatusBadge status={restaurant.crowdLevel} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <p>
          <b>{restaurant.estimatedWaitMinutes} min</b>
          <br />
          <span className="text-stone-500">estimated wait</span>
        </p>
        <p>
          <b>{restaurant.groupsWaiting}</b>
          <br />
          <span className="text-stone-500">groups waiting</span>
        </p>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <StatusBadge status={restaurant.walkInStatus} />
        <Link
          className="text-sm font-medium text-emerald-700"
          href={`/restaurants/${restaurant.slug}`}
        >
          View details →
        </Link>
      </div>
      <p className="mt-3 text-xs text-stone-400">
        Updated {formatLastUpdated(restaurant.lastUpdatedAt, restaurant.timezone)}
      </p>
      {restaurant.stale && (
        <p className="mt-2 text-xs font-medium text-amber-700">
          Live data may be stale
        </p>
      )}
    </PageCard>
  );
}
