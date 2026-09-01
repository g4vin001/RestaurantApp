import { DatabaseUnavailable } from "@/components/DatabaseUnavailable";
import { PublicHomeRefresh } from "@/components/customer/PublicHomeRefresh";
import { RestaurantCard } from "@/components/RestaurantCard";
import { prisma } from "@/lib/prisma";
import {
  fetchPublicRestaurants,
  type PublicRestaurantView,
} from "@/lib/repositories/prisma/public-restaurant-view";
import { reportDataError } from "@/lib/server/data-error";

export async function CustomerHome() {
  let restaurants: PublicRestaurantView[];
  try {
    restaurants = await fetchPublicRestaurants(prisma);
  } catch (error) {
    const reference = reportDataError("customer-home", error);
    return <DatabaseUnavailable reference={reference} />;
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <PublicHomeRefresh />
      <p className="text-sm font-semibold text-emerald-700">
        LIVE RESTAURANT PULSE
      </p>
      <h1 className="mt-2 text-3xl font-bold">Know the wait before you go.</h1>
      <p className="mt-2 max-w-xl text-stone-600">
        Halina helps you check crowd levels and walk-in availability at
        nearby Filipino restaurants.
      </p>
      {restaurants.length === 0 ? (
        <p className="mt-8 text-sm text-stone-500">
          No restaurants yet — check back soon.
        </p>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {restaurants.map((restaurant) => (
            <RestaurantCard key={restaurant.restaurantId} restaurant={restaurant} />
          ))}
        </div>
      )}
    </main>
  );
}
