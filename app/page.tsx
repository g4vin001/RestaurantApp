import { RestaurantCard } from "@/components/RestaurantCard";
import { restaurants } from "@/lib/mock-data";

export default function HomePage() { return <main className="mx-auto max-w-6xl px-5 py-10"><p className="text-sm font-semibold text-emerald-700">LIVE RESTAURANT PULSE</p><h1 className="mt-2 text-3xl font-bold">Know the wait before you go.</h1><p className="mt-2 max-w-xl text-stone-600">Halina helps you check crowd levels and walk-in availability at nearby Filipino restaurants.</p><div className="mt-8 grid gap-4 md:grid-cols-3">{restaurants.map((restaurant) => <RestaurantCard key={restaurant.id} restaurant={restaurant} />)}</div></main>; }
