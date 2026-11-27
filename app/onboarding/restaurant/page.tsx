import Link from "next/link";
import { redirect } from "next/navigation";
import { DatabaseUnavailable } from "@/components/DatabaseUnavailable";
import { PageCard } from "@/components/PageCard";
import { EvidenceInput, ReviewForm } from "@/components/review/ReviewForms";
import { getCurrentAuthUser } from "@/lib/auth/current-identity";
import { getActiveManagerMembership } from "@/lib/auth/manager-membership";
import { applicantRelationships } from "@/lib/auth/restaurant-onboarding";
import { prisma } from "@/lib/prisma";
import { applicationLabels, lifecycleLabels, reviewEventLabels } from "@/lib/restaurants/review";
import { reportDataError } from "@/lib/server/data-error";
import { formatScheduledAt } from "@/lib/helpers";
import { submitRestaurantApplicationAction } from "./actions";

async function applicantView(profileId: string) {
  return Promise.all([
    prisma.restaurantApplication.findFirst({
      where: { applicantId: profileId },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      select: {
        id: true, revision: true, status: true, submittedAt: true, name: true, address: true,
        mapsUrl: true, phone: true, businessEmail: true, applicantName: true, relationship: true, website: true,
        _count: { select: { evidence: true } },
        restaurant: { select: { lifecycle: true, archivedAt: true } },
        history: {
          where: { action: { not: "NOTE_ADDED" } },
          select: { id: true, action: true, message: true, createdAt: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        },
      },
    }),
    getActiveManagerMembership(profileId),
  ]);
}

export default async function RestaurantOnboardingPage() {
  if (process.env.NEXT_PUBLIC_HALINA_DEMO_MODE === "true") redirect("/manager");
  const user = await getCurrentAuthUser();
  if (!user) redirect("/login?redirectTo=/onboarding/restaurant");

  let data: Awaited<ReturnType<typeof applicantView>>;
  try {
    data = await applicantView(user.id);
  } catch {
    return <DatabaseUnavailable reference={reportDataError("onboarding-application", new Error("Application lookup failed"))} />;
  }
  const [application, membership] = data;
  const canEdit = !membership && (!application || application.status === "NEEDS_INFORMATION" || application.status === "DECLINED");
  const needsInfo = application?.status === "NEEDS_INFORMATION";
  const needsEvidence = !needsInfo || !application?._count.evidence;
  const verified = Boolean(user.email && user.email_confirmed_at && !user.is_anonymous);
  const fields = [
    ["name", "Restaurant name", "text", 80, 2],
    ["phone", "Restaurant contact number", "tel", 35],
    ["address", "Complete business address", "text", 300, 10],
    ["mapsUrl", "Google Maps location link", "url", 2048],
    ["businessEmail", "Business email address", "email", 254],
    ["applicantName", "Your full name", "text", 100, 2],
  ] as const;

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
      <h1 className="text-3xl font-bold tracking-tight text-stone-950">{application ? "Restaurant application" : "Apply to list a restaurant"}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">Halina reviews business details and proof of authorization before granting access to restaurant setup.</p>
      {application && (
        <PageCard className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-stone-950">{application.name}</h2>
            <span className="review-badge">{applicationLabels[application.status]}</span>
          </div>
          <p className="mt-1 text-sm text-stone-600">Submitted {formatScheduledAt(application.submittedAt.toISOString())}</p>
          {application.status === "PENDING" && <p className="mt-4 text-sm text-stone-700">Your application is awaiting review. Updates will appear here.</p>}
          {needsInfo && <p className="mt-4 text-sm text-stone-700">Reply to the reviewer below to put your application back in the review queue.</p>}
          {application.status === "DECLINED" && <p className="mt-4 text-sm text-stone-700">Read the reviewer’s feedback, correct the details below, and resubmit with supporting evidence.</p>}
          {application.restaurant && <p className="mt-4 text-sm text-stone-700">Restaurant status · {application.restaurant.archivedAt ? "Archived" : lifecycleLabels[application.restaurant.lifecycle]}</p>}
          {membership && <Link href="/manager" className="review-primary mt-4">Open manager dashboard</Link>}
        </PageCard>
      )}
      {!application && membership && <Link href="/manager" className="review-primary mt-6">Open manager dashboard</Link>}
      {!!application?.history.length && (
        <PageCard className="mt-6">
          <h2 className="text-lg font-semibold text-stone-950">Application updates</h2>
          <ol className="mt-3 divide-y divide-stone-200">
            {application.history.map((event) => (
              <li key={event.id} className="py-3">
                <p className="text-sm font-semibold text-stone-900">{reviewEventLabels[event.action]}</p>
                <p className="mt-1 text-xs text-stone-600">{formatScheduledAt(event.createdAt.toISOString())}</p>
                {event.message && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-stone-700">{event.message}</p>}
              </li>
            ))}
          </ol>
        </PageCard>
      )}
      {canEdit && !verified && (
        <PageCard className="mt-6">
          <h2 className="font-semibold text-stone-950">Verify your email to continue</h2>
          <p className="mt-2 text-sm text-stone-700">Open the confirmation email sent by Halina, then return here and sign in again.</p>
        </PageCard>
      )}
      {canEdit && verified && (
        <PageCard className="mt-6">
          <h2 className="text-lg font-semibold text-stone-950">{needsInfo ? "Reply to the reviewer" : application ? "Correct and reapply" : "Restaurant and applicant details"}</h2>
          <p className="mb-5 mt-2 break-words text-sm text-stone-600">Verified account email · {user.email}</p>
          <ReviewForm action={submitRestaurantApplicationAction} submit={application ? "Resubmit application" : "Submit application"}>
            {application && <>
              <input name="applicationId" type="hidden" value={application.id} />
              <input name="revision" type="hidden" value={application.revision} />
            </>}
            {needsInfo && <label className="block text-sm font-medium">Response to reviewer
              <textarea name="response" required minLength={4} maxLength={2000} rows={4} className="review-field" />
            </label>}
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map(([name, label, type, max, min]) => (
                <label key={name} className={name === "address" ? "text-sm font-medium sm:col-span-2" : "text-sm font-medium"}>
                  {label}<input name={name} type={type} required minLength={min} maxLength={max} defaultValue={application?.[name]} className="review-field" />
                </label>
              ))}
              <label className="text-sm font-medium">Relationship to restaurant
                <select name="relationship" required defaultValue={application?.relationship ?? ""} className="review-field">
                  <option value="" disabled>Select a relationship</option>
                  {Object.entries(applicantRelationships).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium sm:col-span-2">Website or social media page <span className="font-normal text-stone-600">(optional)</span>
                <input name="website" type="url" maxLength={2048} defaultValue={application?.website ?? ""} className="review-field" />
              </label>
            </div>
            <label className="block text-sm font-medium">{needsEvidence ? "Proof of ownership or authorization" : "Additional supporting evidence (optional)"}
              <EvidenceInput required={needsEvidence} />
            </label>
            <p id="evidence-help" className="text-sm text-stone-600">PDF, PNG, or JPEG up to 2 MB. Only authorized Halina administrators can open your evidence.</p>
          </ReviewForm>
        </PageCard>
      )}
    </main>
  );
}
