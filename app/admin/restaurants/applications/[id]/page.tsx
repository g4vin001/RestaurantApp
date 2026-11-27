import Link from "next/link";
import { notFound } from "next/navigation";
import { PageCard } from "@/components/PageCard";
import { ReviewForm } from "@/components/review/ReviewForms";
import { ReviewHistory } from "@/components/review/ReviewHistory";
import { DatabaseUnavailable } from "@/components/DatabaseUnavailable";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import { applicantRelationships } from "@/lib/auth/restaurant-onboarding";
import { formatScheduledAt } from "@/lib/helpers";
import { prisma } from "@/lib/prisma";
import { findPossibleRestaurantDuplicates } from "@/lib/repositories/prisma/restaurant-applications";
import { applicationLabels, approvalChecks, lifecycleLabels, reviewUuid } from "@/lib/restaurants/review";
import { reportDataError } from "@/lib/server/data-error";
import { readReviewNotice } from "@/lib/restaurants/review-notice";
import { decideApplication } from "../../actions";

async function loadApplication(id: string) {
  const application = await prisma.restaurantApplication.findUnique({
    where: { id },
    include: {
      history: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
      evidence: { select: { id: true, filename: true, submittedAt: true }, orderBy: { submittedAt: "desc" } },
      restaurant: { select: { id: true, lifecycle: true } },
    },
  });
  return application ? { application, duplicates: await findPossibleRestaurantDuplicates(prisma, application) } : null;
}

export default async function ApplicationReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  if (!reviewUuid(id)) notFound();
  const notice = await readReviewNotice();
  let data: Awaited<ReturnType<typeof loadApplication>>;
  try {
    data = await loadApplication(id);
  } catch {
    return <DatabaseUnavailable reference={reportDataError("restaurant-review-details", new Error("Application lookup failed"))} />;
  }
  if (!data) notFound();
  const { application, duplicates: [listings, applications] } = data;
  const action = decideApplication.bind(null, id);
  const pending = application.status === "PENDING";
  const exactDuplicate = listings.some((item) => item.exact);
  const verifiedSubmission = Boolean(application.emailVerifiedAt && application.evidence.length);
  const fields = [
    ["Business address", application.address],
    ["Business email", application.businessEmail],
    ["Contact number", application.phone],
    ["Applicant", application.applicantName],
    ["Applicant relationship", application.relationship ? applicantRelationships[application.relationship] : "Not provided"],
    ["Account email at submission", application.applicantEmail],
  ];
  const hidden = (decision: string) => <>
    <input name="revision" type="hidden" value={application.revision} />
    <input name="decision" type="hidden" value={decision} />
  </>;

  return (
    <>
      <Link href="/admin/restaurants" className="text-sm font-semibold text-emerald-900 hover:underline">← Applications</Link>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="break-words text-3xl font-bold tracking-tight text-stone-950">{application.name}</h1>
        <span className="review-badge">{applicationLabels[application.status]}</span>
      </div>
      <p className="mt-2 text-sm text-stone-600">Submitted {formatScheduledAt(application.submittedAt.toISOString())} · Updated {formatScheduledAt(application.updatedAt.toISOString())}</p>
      {notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
      {application.restaurant && <Link href={`/admin/restaurants/listings/${application.restaurant.id}`} className="review-secondary mt-4">Restaurant listing · {lifecycleLabels[application.restaurant.lifecycle]}</Link>}
      <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="min-w-0">
          <PageCard>
            <h2 className="text-lg font-semibold text-stone-950">Business and applicant</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {fields.map(([label, value]) => <div key={label} className="min-w-0">
                <dt className="text-xs font-medium text-stone-600">{label}</dt><dd className="mt-1 break-words text-sm text-stone-950">{value || "Not provided"}</dd>
              </div>)}
            </dl>
            <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-emerald-900">
              <a href={application.mapsUrl} target="_blank" rel="noopener noreferrer" className="underline">Open Google Maps</a>
              {application.website && <a href={application.website} target="_blank" rel="noopener noreferrer" className="underline">Open website or social page</a>}
            </div>
          </PageCard>
          <PageCard className="mt-5">
            <h2 className="text-lg font-semibold text-stone-950">Supporting documents</h2>
            {application.evidence.length === 0 ? <p className="mt-2 text-sm text-stone-600">No documents on this application.</p> : <ul className="mt-3 divide-y divide-stone-200">
              {application.evidence.map((document) => <li key={document.id} className="py-3">
                <a href={`/admin/restaurants/applications/${id}/evidence/${document.id}`} className="break-all text-sm font-semibold text-emerald-900 underline">Download {document.filename}</a>
                <p className="mt-1 text-xs text-stone-600">{formatScheduledAt(document.submittedAt.toISOString())}</p>
              </li>)}
            </ul>}
          </PageCard>
          <PageCard className="mt-5">
            <h2 className="text-lg font-semibold text-stone-950">Potential duplicate listings</h2>
            {listings.length === 0 && applications.length === 0 ? <p className="mt-2 text-sm text-stone-600">No matches found in the current listings or applications.</p> : <ul className="mt-3 space-y-3 text-sm text-stone-700">
              {listings.map((item) => <li key={item.id}>
                <Link href={`/admin/restaurants/listings/${item.id}`} className="font-semibold text-emerald-900 underline">{item.name}</Link> · {item.location}
                {item.exact && <p className="mt-1 font-medium text-rose-800">Exact name and address match. Resolve the existing listing before approval.</p>}
              </li>)}
              {applications.map((item) => <li key={item.id}>
                <Link href={`/admin/restaurants/applications/${item.id}`} className="font-semibold text-emerald-900 underline">{item.name}</Link> · {applicationLabels[item.status]} application
              </li>)}
            </ul>}
          </PageCard>
          <ReviewHistory events={application.history} />
        </div>
        <div className="min-w-0 space-y-5">
          <PageCard>
            <h2 className="text-lg font-semibold text-stone-950">Verification</h2>
            <p className="mt-3 text-sm font-semibold text-stone-900">Automatically validated on submission</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-700">
              {application.emailVerifiedAt ? <>
                <li>Supabase confirmed the account email on {formatScheduledAt(application.emailVerifiedAt.toISOString())}.</li>
                <li>The Google Maps link passed format validation.</li>
              </> : <li>This earlier application has no recorded email verification timestamp.</li>}
            </ul>
            {pending && !exactDuplicate && verifiedSubmission && <>
              <p className="mb-3 mt-5 text-sm font-semibold text-stone-900">Administrator confirmation</p>
              <p className="mb-4 text-sm text-stone-600">Check the location independently and use the supporting evidence to confirm authorization.</p>
              <ReviewForm action={action} submit="Approve application" confirmation="Approve this application and give the applicant owner access to a private restaurant workspace?">
                {hidden("APPROVED")}
                <div className="space-y-3">
                  {approvalChecks.map(([key, label]) => <label key={key} className="flex items-start gap-3 text-sm text-stone-800">
                    <input type="checkbox" name={key} required className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-800" />{label}
                  </label>)}
                </div>
              </ReviewForm>
            </>}
            {pending && exactDuplicate && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">Approval is blocked by a matching listing.</p>}
            {pending && !verifiedSubmission && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Request the missing information and evidence before approving.</p>}
          </PageCard>
          {(pending || application.status === "NEEDS_INFORMATION") && <PageCard>
            <h2 className="mb-3 text-lg font-semibold text-stone-950">Send a decision</h2>
            {pending && <details className="border-b border-stone-200 py-3" open>
              <summary className="mb-3 cursor-pointer text-sm font-semibold text-stone-900">Request information</summary>
              <ReviewForm action={action} submit="Send information request">
                {hidden("INFORMATION_REQUESTED")}
                <label className="block text-sm font-medium">What should the applicant provide?
                  <textarea name="message" required minLength={4} maxLength={2000} rows={3} className="review-field" />
                </label>
              </ReviewForm>
            </details>}
            <details className="pt-3">
              <summary className="mb-3 cursor-pointer text-sm font-semibold text-stone-900">Decline application</summary>
              <ReviewForm action={action} submit="Decline application" confirmation="Decline this application and share the reason with the applicant?">
                {hidden("DECLINED")}
                <label className="block text-sm font-medium">Reason for declining
                  <textarea name="message" required minLength={4} maxLength={2000} rows={3} className="review-field" />
                </label>
              </ReviewForm>
            </details>
          </PageCard>}
          <PageCard>
            <h2 className="text-lg font-semibold text-stone-950">Internal note</h2>
            <p className="mb-4 mt-1 text-sm text-stone-600">Visible to platform administrators.</p>
            <ReviewForm key={application.revision} action={action} submit="Save internal note">
              {hidden("NOTE_ADDED")}
              <label className="block text-sm font-medium">Note
                <textarea name="message" required minLength={4} maxLength={2000} rows={3} className="review-field" />
              </label>
            </ReviewForm>
          </PageCard>
        </div>
      </div>
    </>
  );
}
