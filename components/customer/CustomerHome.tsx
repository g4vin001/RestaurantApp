"use client";

import { useEffect, useMemo, useState } from "react";
import { RestaurantCard } from "@/components/RestaurantCard";
import { useOnlineStatus } from "@/components/customer/useOnlineStatus";
import { useDemo } from "@/components/demo/DemoProvider";
import { selectPublicRestaurantState } from "@/lib/domain/analytics";
import { restaurants } from "@/lib/mock-data";
import type { Restaurant } from "@/lib/types";

export function CustomerHome() {
  const { state } = useDemo();
  const online = useOnlineStatus();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const publicRestaurant = useMemo(
    () => selectPublicRestaurantState(state, now),
    [now, state],
  );
  const cards = restaurants.map((restaurant): Restaurant => {
    if (restaurant.id !== state.restaurant.id) return restaurant;
    return {
      ...restaurant,
      name: publicRestaurant.name,
      location: publicRestaurant.location,
      crowdLevel: publicRestaurant.crowdLevel,
      estimatedWaitMinutes: publicRestaurant.estimatedWaitMinutes,
      groupsWaiting: publicRestaurant.groupsWaiting,
      walkInStatus: publicRestaurant.walkInStatus,
      lastUpdatedAt: publicRestaurant.lastUpdatedAt,
      stale: publicRestaurant.stale,
      offline: !online,
    };
  });

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <p className="text-sm font-semibold text-emerald-700">
        LIVE RESTAURANT PULSE
      </p>
      <h1 className="mt-2 text-3xl font-bold">Know the wait before you go.</h1>
      <p className="mt-2 max-w-xl text-stone-600">
        Halina helps you check crowd levels and walk-in availability at nearby
        Filipino restaurants.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {cards.map((restaurant) => (
          <RestaurantCard key={restaurant.id} restaurant={restaurant} />
        ))}
      </div>
    </main>
  );
}
