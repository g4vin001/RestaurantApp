"use client";

import { useEffect, useMemo, useState } from "react";
import { useDemo } from "@/components/demo/DemoProvider";
import { useOnlineStatus } from "@/components/customer/useOnlineStatus";
import { PageCard } from "@/components/PageCard";
import { StatusBadge } from "@/components/StatusBadge";
import { selectPublicRestaurantState } from "@/lib/domain/analytics";
import { formatLastUpdated } from "@/lib/helpers";
import type { Restaurant } from "@/lib/types";

export function CustomerRestaurantDetail({
  restaurant,
}: {
  restaurant: Restaurant;
}) {
  const { state } = useDemo();
  const online = useOnlineStatus();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const managed = restaurant.id === state.restaurant.id;
  const publicState = useMemo(
    () => selectPublicRestaurantState(state, now),
    [now, state],
  );

  if (!managed) {
    return (
      <StaticRestaurantDetail
        restaurant={restaurant}
        availableTables={1}
        totalTables={4}
        online={online}
      />
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-sm text-stone-500">
        {publicState.location} · Filipino
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{publicState.name}</h1>
        <StatusBadge status={publicState.walkInStatus} />
      </div>
      <div className="mt-7 grid gap-4 sm:grid-cols-3">
        <PageCard>
          <b>{publicState.estimatedWaitMinutes} min</b>
          <p className="text-sm text-stone-500">estimated wait</p>
        </PageCard>
        <PageCard>
          <b>{publicState.groupsWaiting}</b>
          <p className="text-sm text-stone-500">groups in queue</p>
        </PageCard>
        <PageCard>
          <b>
            {publicState.availableTables} of {publicState.activeTables}
          </b>
          <p className="text-sm text-stone-500">tables available</p>
        </PageCard>
      </div>
      <PageCard className="mt-5">
        <p className="text-sm text-stone-500">
          Last updated {formatLastUpdated(publicState.lastUpdatedAt)}
        </p>
        {!online ? (
          <p className="mt-2 text-sm font-medium text-rose-700">
            You are offline. Showing the last saved update from this browser.
          </p>
        ) : publicState.stale ? (
          <p className="mt-2 text-sm font-medium text-amber-700">
            Live information may be a few minutes old.
          </p>
        ) : null}
      </PageCard>
    </main>
  );
}

function StaticRestaurantDetail({
  restaurant,
  availableTables,
  totalTables,
  online,
}: {
  restaurant: Restaurant;
  availableTables: number;
  totalTables: number;
  online: boolean;
}) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-sm text-stone-500">
        {restaurant.location} · {restaurant.cuisineType}
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
            {availableTables} of {totalTables}
          </b>
          <p className="text-sm text-stone-500">tables available</p>
        </PageCard>
      </div>
      <PageCard className="mt-5">
        <p className="text-sm text-stone-500">
          Last updated {formatLastUpdated(restaurant.lastUpdatedAt)}
        </p>
        {!online && (
          <p className="mt-2 text-sm font-medium text-rose-700">
            You are offline. Showing the last saved update from this browser.
          </p>
        )}
      </PageCard>
    </main>
  );
}
