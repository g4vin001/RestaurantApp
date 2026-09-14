import Link from "next/link";
import { PageCard } from "@/components/PageCard";
import { StatusBadge } from "@/components/StatusBadge";
import { formatScheduledAt } from "@/lib/helpers";
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
        <StatusBadge status={restaurant.service.openNow ? restaurant.crowdLevel : "Closed"} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <p>
          <b>{restaurant.walkInStatus === "Closed" || restaurant.walkInStatus === "Paused" ? "Unavailable" : `~${restaurant.estimatedWaitMinutes} min`}</b>
          <br />
          <span className="text-stone-500">rough wait estimate</span>
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
      <p className="mt-3 text-sm text-stone-600">{restaurant.service.statusLabel}</p>
      <p className="mt-3 text-xs leading-5 text-stone-600">
        Last restaurant activity: {formatScheduledAt(restaurant.lastUpdatedAt, restaurant.timezone)}
      </p>
      {restaurant.stale && (
        <p className="mt-2 text-xs font-medium text-amber-700">
          No recent activity recorded. Confirm availability with the host.
        </p>
      )}
    </PageCard>
  );
}
