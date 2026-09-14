import Link from "next/link";
import { randomUUID } from "node:crypto";
import { PageCard } from "@/components/PageCard";
import { StatusBadge } from "@/components/StatusBadge";
import { PublicFloorMap } from "@/components/customer/PublicFloorMap";
import { CustomerRefresh } from "@/components/customer/CustomerRefresh";
import { OpeningHours } from "@/components/customer/OpeningHours";
import { formatScheduledAt } from "@/lib/helpers";
import type { PublicRestaurantView } from "@/lib/repositories/prisma/public-restaurant-view";

export function LiveRestaurantDetail({ restaurant, slug }: { restaurant: PublicRestaurantView; slug: string }) {
  const accepting = restaurant.service.openNow && restaurant.walkInStatus !== "Paused";
  return <main className="mx-auto max-w-5xl px-5 py-8 sm:py-10">
    <Link href="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800">← All restaurants</Link>
    <p className="mt-3 text-sm text-stone-600">{[restaurant.cuisineType, restaurant.location].filter(Boolean).join(" · ")}</p>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-3xl font-bold tracking-tight text-stone-950">{restaurant.name}</h1>
      <StatusBadge status={restaurant.walkInStatus} />
    </div>
    <div className="mt-5"><OpeningHours service={restaurant.service} timeZone={restaurant.timezone} /></div>
    <section aria-label="Plan your visit" className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 sm:p-6">
      <h2 className="text-sm font-semibold text-emerald-900">Plan your visit</h2>
      <dl className="mt-4 grid gap-5 sm:grid-cols-3">
        <div><dt className="text-sm text-stone-600">Estimated walk-in wait</dt><dd className="mt-1 text-3xl font-bold text-stone-950">{accepting ? `~${restaurant.estimatedWaitMinutes} min` : "Unavailable"}</dd></div>
        <div><dt className="text-sm text-stone-600">Groups waiting</dt><dd className="mt-1 text-3xl font-bold text-stone-950">{restaurant.groupsWaiting}</dd></div>
        <div><dt className="text-sm text-stone-600">{restaurant.service.openNow ? "Tables available now" : "Tables ready for next service"}</dt><dd className="mt-1 text-3xl font-bold text-stone-950">{restaurant.availableTables} <span className="text-lg font-medium text-stone-500">of {restaurant.activeTables}</span></dd></div>
      </dl>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-600">{accepting
        ? "A rough estimate from the recorded queue and table availability. Your party size and table fit can change the wait; confirm with the host."
        : restaurant.service.openNow ? "Walk-ins are paused. You can still request a reservation for a future service." : "The waitlist opens during service hours. You can still request a reservation for a future service."}</p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {accepting && <Link href={`/restaurants/${slug}/waitlist`} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-800 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-900">Join waitlist</Link>}
        <Link href={`/restaurants/${slug}/book`} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-800 hover:bg-stone-50">Request a reservation</Link>
        <Link href="/my/waitlist" className="inline-flex min-h-12 items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">My waitlist</Link>
      </div>
      <p className="mt-3 text-xs leading-5 text-stone-600">Reservation requests need restaurant approval. Availability is not a seating guarantee.</p>
    </section>
    <div className="mt-5"><CustomerRefresh snapshotId={randomUUID()} checkedAt={restaurant.checkedAt} slug={slug} timeZone={restaurant.timezone} /></div>
    <p className="mt-3 text-xs leading-5 text-stone-600">Last restaurant activity: {formatScheduledAt(restaurant.lastUpdatedAt, restaurant.timezone)}.
      {restaurant.stale && " No activity recorded in the last 5 minutes; check with the host if you are travelling."}
    </p>
    <details className="mt-6 rounded-2xl border border-stone-200 bg-white p-5">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-stone-800">More table availability details</summary>
      <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
        <div><dt className="text-stone-600">Seats across ready tables</dt><dd className="mt-1 text-xl font-bold">{restaurant.availableSeatCapacity}</dd></div>
        <div><dt className="text-stone-600">Largest ready table</dt><dd className="mt-1 text-xl font-bold">{restaurant.largestAvailableTable ? `${restaurant.largestAvailableTable} seats` : "None"}</dd></div>
        <div><dt className="text-stone-600">Tables being prepared</dt><dd className="mt-1 text-xl font-bold">{restaurant.preparingTables}</dd></div>
      </dl>
      {restaurant.reservedTables > 0 && <p className="mt-4 text-sm text-stone-600">{restaurant.reservedTables} {restaurant.reservedTables === 1 ? "table has" : "tables have"} upcoming reservations.</p>}
    </details>
    {restaurant.publicFloor ? <PublicFloorMap floor={restaurant.publicFloor} /> : <PageCard className="mt-6">
      <h2 className="font-semibold text-stone-800">Dining layout not published yet</h2>
      <p className="mt-1 text-sm leading-6 text-stone-600">Wait and table totals are available. The restaurant has not published a floor layout yet.</p>
    </PageCard>}
  </main>;
}
