import Link from "next/link";
import { PageCard } from "@/components/PageCard";
import { StatusBadge } from "@/components/StatusBadge";
import { formatLastUpdated } from "@/lib/helpers";
import type { Restaurant } from "@/lib/types";

export function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  return (
    <PageCard>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">{restaurant.name}</h2>
          <p className="text-sm text-stone-500">
            {restaurant.cuisineType} · {restaurant.location}
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
          href={`/restaurants/${restaurant.id}`}
        >
          View details →
        </Link>
      </div>
      <p className="mt-3 text-xs text-stone-400">
        Updated {formatLastUpdated(restaurant.lastUpdatedAt)}
      </p>
      {restaurant.offline ? (
        <p className="mt-2 text-xs font-medium text-rose-700">
          Offline · showing saved data
        </p>
      ) : restaurant.stale ? (
        <p className="mt-2 text-xs font-medium text-amber-700">
          Live data may be stale
        </p>
      ) : null}
    </PageCard>
  );
}
