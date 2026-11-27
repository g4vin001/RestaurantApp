import Link from "next/link";
import { notFound } from "next/navigation";
import { DatabaseUnavailable } from "@/components/DatabaseUnavailable";
import { PageCard } from "@/components/PageCard";
import { ReviewForm } from "@/components/review/ReviewForms";
import { ReviewHistory } from "@/components/review/ReviewHistory";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import { formatScheduledAt } from "@/lib/helpers";
import { prisma } from "@/lib/prisma";
import { getPublicationSetup } from "@/lib/repositories/prisma/restaurant-publication";
import { lifecycleLabels, reviewUuid } from "@/lib/restaurants/review";
import { reportDataError } from "@/lib/server/data-error";
import { readReviewNotice } from "@/lib/restaurants/review-notice";
import { decidePublication } from "../../actions";

async function listingView(id: string) {
  return Promise.all([
    getPublicationSetup(prisma, id),
    prisma.restaurantReviewEvent.findMany({
      where: { restaurantId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
  ]);
}

export default async function ListingReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  if (!reviewUuid(id)) notFound();
  const notice = await readReviewNotice();
  let data: Awaited<ReturnType<typeof listingView>>;
  try {
    data = await listingView(id);
  } catch {
    return <DatabaseUnavailable reference={reportDataError("restaurant-listing-review", new Error("Listing lookup failed"))} />;
  }
  const [setup, events] = data;
  if (!setup) notFound();
  const { restaurant, checks, ready, services } = setup;
  const action = decidePublication.bind(null, id);
  const inSetup = restaurant.lifecycle === "SETUP";
  const requested = Boolean(restaurant.publicationRequestedAt);
  const hidden = (decision: string) => <>
    <input name="revision" type="hidden" value={restaurant.revision} />
    <input name="decision" type="hidden" value={decision} />
  </>;
  const stateChange = restaurant.lifecycle === "SUSPENDED"
    ? { label: "Restore restaurant", decision: "RESTORED", confirm: "Restore the restaurant’s public listing and its enabled services?" }
    : { label: "Suspend restaurant", decision: "SUSPENDED", confirm: "Hide this listing and block new online reservations and waitlist requests? Existing records remain available to restaurant staff." };

  return (
    <>
      <Link href="/admin/restaurants?view=listings" className="text-sm font-semibold text-emerald-900 hover:underline">← Restaurant listings</Link>
      <div className="mt-4 flex flex-wrap items-baseline gap-3">
        <h1 className="break-words text-3xl font-bold tracking-tight text-stone-950">{restaurant.name}</h1>
        <span className="review-badge">{lifecycleLabels[restaurant.lifecycle]}</span>
        <span className="rounded-full bg-stone-200 px-3 py-1 text-xs font-semibold text-stone-800">{restaurant.environment}</span>
      </div>
      <p className="mt-2 break-words text-sm text-stone-600">{restaurant.location || "No business address recorded"}</p>
      {notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
      {restaurant.application && <Link href={`/admin/restaurants/applications/${restaurant.application.id}`} className="review-secondary mt-4">View approved application</Link>}
      {restaurant.publicationRequestedAt && <p className="mt-3 text-sm text-stone-700">Publication requested {formatScheduledAt(restaurant.publicationRequestedAt.toISOString())}</p>}
      {restaurant.environment === "LIVE" && <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <PageCard>
          <h2 className="text-lg font-semibold text-stone-950">{inSetup ? "Publication readiness" : "Customer services"}</h2>
          {inSetup && <ul className="mt-4 space-y-3">
            {checks.map((check) => <li key={check.label} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              {check.label}<span className={check.complete ? "review-badge" : "rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900"}>{check.complete ? "Complete" : "Incomplete"}</span>
            </li>)}
          </ul>}
          <p className="mt-4 text-sm text-stone-700">Online reservations {services.reservations ? "enabled" : "disabled"} · Online waitlist {services.waitlist ? "enabled" : "disabled"}</p>
        </PageCard>
        <PageCard>
          <h2 className="mb-4 text-lg font-semibold text-stone-950">Review actions</h2>
          {inSetup && !requested && <p className="text-sm text-stone-700">The owner has yet to request publication.</p>}
          {inSetup && requested && <>
            {ready ? <ReviewForm action={action} submit="Publish restaurant" confirmation="Make this restaurant and its enabled services available to customers?">
              {hidden("PUBLISHED")}
            </ReviewForm> : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Complete all setup items before publication.</p>}
            <details className="mt-5 border-t border-stone-200 pt-4">
              <summary className="mb-4 cursor-pointer text-sm font-semibold">Return for changes</summary>
              <ReviewForm action={action} submit="Return publication request">
                {hidden("PUBLICATION_RETURNED")}
                <label className="block text-sm font-medium">What should the owner change?<textarea name="message" required minLength={4} maxLength={2000} rows={3} className="review-field" /></label>
              </ReviewForm>
            </details>
          </>}
          {!inSetup && <ReviewForm action={action} submit={stateChange.label} confirmation={stateChange.confirm}>
            {hidden(stateChange.decision)}
            <label className="block text-sm font-medium">Reason<textarea name="message" required minLength={4} maxLength={2000} rows={3} className="review-field" /></label>
          </ReviewForm>}
        </PageCard>
      </div>}
      <ReviewHistory events={events} />
    </>
  );
}
