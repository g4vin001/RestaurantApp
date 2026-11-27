import Link from "next/link";
import { notFound } from "next/navigation";
import { DatabaseUnavailable } from "@/components/DatabaseUnavailable";
import { PageCard } from "@/components/PageCard";
import { ReviewForm } from "@/components/review/ReviewForms";
import { ReviewHistory } from "@/components/review/ReviewHistory";
import { getCurrentAuthIdentity } from "@/lib/auth/current-identity";
import { getActiveManagerMembership } from "@/lib/auth/manager-membership";
import { prisma } from "@/lib/prisma";
import { getPublicationSetup } from "@/lib/repositories/prisma/restaurant-publication";
import { lifecycleLabels } from "@/lib/restaurants/review";
import { reportDataError } from "@/lib/server/data-error";
import { saveRestaurantSetup } from "./actions";

export default async function RestaurantSetupPage() {
  if (process.env.NEXT_PUBLIC_HALINA_DEMO_MODE === "true") notFound();
  const user = await getCurrentAuthIdentity();
  if (!user) notFound();

  let data;
  try {
    const membership = await getActiveManagerMembership(user.id);
    if (membership && membership.restaurant.environment === "LIVE") {
      data = await Promise.all([
        getPublicationSetup(prisma, membership.restaurantId),
        prisma.restaurantReviewEvent.findMany({
          where: { restaurantId: membership.restaurantId, action: { in: ["PUBLICATION_REQUESTED", "PUBLICATION_RETURNED", "PUBLISHED", "SUSPENDED", "RESTORED"] } },
          select: { id: true, action: true, createdAt: true, message: true, fromLifecycle: true, toLifecycle: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        }),
      ]).then(([setup, events]) => setup && { ...setup, events, owner: membership.role === "OWNER" });
    }
  } catch {
    return <DatabaseUnavailable reference={reportDataError("restaurant-owner-setup", new Error("Setup lookup failed"))} />;
  }
  if (!data) notFound();
  const { restaurant, checks, services, ready, owner, events } = data;
  const setup = restaurant.lifecycle === "SETUP";
  return (
    <section className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold text-stone-950">Restaurant publication</h1>
        <span className="review-badge">{lifecycleLabels[restaurant.lifecycle]}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        {setup ? "Complete setup before an administrator can publish your restaurant."
          : restaurant.lifecycle === "PUBLISHED" ? "Customers can find your restaurant and use the services you enable."
            : "The public listing and new customer requests are paused. You can still manage existing reservations and waitlist entries."}
      </p>
      {setup && <PageCard className="mt-5">
        <h2 className="text-lg font-semibold text-stone-950">Setup checklist</h2>
        <ul className="mt-3 divide-y divide-stone-200">
          {checks.map((check) => <li key={check.label} className="flex flex-wrap items-start justify-between gap-2 py-3">
            <div><p className="font-medium text-stone-950">{check.label}</p><p className="mt-1 text-sm text-stone-600">{check.info}</p></div>
            <span className={check.complete ? "review-badge" : "rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900"}>{check.complete ? "Complete" : "To do"}</span>
          </li>)}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/manager/settings" className="review-secondary">Operating hours</Link>
          <Link href="/manager/layout" className="review-secondary">Floor plans</Link>
          <Link href="/manager/team" className="review-secondary">Team</Link>
        </div>
      </PageCard>}
      {owner && <PageCard className="mt-5">
        <h2 className="mb-4 text-lg font-semibold text-stone-950">Customer services</h2>
        <ReviewForm action={saveRestaurantSetup} submit="Save customer preferences">
          <input name="setupAction" type="hidden" value="SERVICES" />
          {setup ? <>
            <input name="configureReservations" type="hidden" value="yes" />
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="reservations" defaultChecked={services.reservations} className="accent-emerald-800" />Allow online reservation requests</label>
          </> : <Link href="/manager/settings" className="text-sm font-semibold text-emerald-900 underline">Edit online reservation settings</Link>}
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="waitlist" defaultChecked={services.waitlist} className="accent-emerald-800" />Allow online waitlist requests</label>
        </ReviewForm>
      </PageCard>}
      {setup && <PageCard className="mt-5">
        <h2 className="mb-3 text-lg font-semibold text-stone-950">Request publication</h2>
        {restaurant.publicationRequestedAt ? <p role="status" className="text-sm text-stone-700">Your request is awaiting administrator review.</p>
          : !owner ? <p className="text-sm text-stone-700">The restaurant owner can request publication.</p>
            : !ready ? <p className="text-sm text-stone-700">Complete every checklist item to request publication.</p>
              : <ReviewForm action={saveRestaurantSetup} submit="Request publication" confirmation="Send this restaurant to Halina for publication review?">
                <input name="setupAction" type="hidden" value="PUBLICATION_REQUESTED" />
              </ReviewForm>}
      </PageCard>}
      {!!events.length && <ReviewHistory events={events} />}
    </section>
  );
}
