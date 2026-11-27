import Link from "next/link";
import { DatabaseUnavailable } from "@/components/DatabaseUnavailable";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import type { Prisma } from "@/lib/generated/prisma/client";
import { formatScheduledAt } from "@/lib/helpers";
import { prisma } from "@/lib/prisma";
import { applicationLabels, lifecycleLabels } from "@/lib/restaurants/review";
import { reportDataError } from "@/lib/server/data-error";

const pageSize = 20;
type Query = { view?: string; status?: string; q?: string; page?: string };

async function loadApplications(status: string, q: string, page: number) {
  const where: Prisma.RestaurantApplicationWhereInput = {
    status: Object.hasOwn(applicationLabels, status) ? status as keyof typeof applicationLabels : undefined,
    OR: q ? [
      { name: { contains: q, mode: "insensitive" } }, { applicantName: { contains: q, mode: "insensitive" } },
      { applicantEmail: { contains: q, mode: "insensitive" } }, { address: { contains: q, mode: "insensitive" } },
      { businessEmail: { contains: q, mode: "insensitive" } },
    ] : undefined,
  };
  const [records, count] = await Promise.all([
    prisma.restaurantApplication.findMany({
      where, skip: (page - 1) * pageSize, take: pageSize,
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      select: { id: true, name: true, address: true, applicantName: true, status: true, submittedAt: true },
    }),
    prisma.restaurantApplication.count({ where }),
  ]);
  return { count, rows: records.map((item) => ({
    ...item, description: item.address, secondary: item.applicantName, date: item.submittedAt,
    badge: applicationLabels[item.status], href: `/admin/restaurants/applications/${item.id}`,
  })) };
}

async function loadListings(status: string, q: string, page: number) {
  const where: Prisma.RestaurantWhereInput = {
    archivedAt: null,
    lifecycle: status === "REQUESTED" ? "SETUP" : Object.hasOwn(lifecycleLabels, status) ? status as keyof typeof lifecycleLabels : undefined,
    publicationRequestedAt: status === "REQUESTED" ? { not: null } : undefined,
    OR: q ? [
      { name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } },
      { location: { contains: q, mode: "insensitive" } },
    ] : undefined,
  };
  const [records, count] = await Promise.all([
    prisma.restaurant.findMany({
      where, skip: (page - 1) * pageSize, take: pageSize,
      orderBy: [{ publicationRequestedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { id: "desc" }],
      select: { id: true, name: true, location: true, lifecycle: true, environment: true, publicationRequestedAt: true, createdAt: true },
    }),
    prisma.restaurant.count({ where }),
  ]);
  return { count, rows: records.map((item) => ({
    ...item, description: item.location, secondary: item.environment, date: item.publicationRequestedAt ?? item.createdAt,
    badge: item.publicationRequestedAt ? "Publication requested" : lifecycleLabels[item.lifecycle],
    href: `/admin/restaurants/listings/${item.id}`,
  })) };
}

export default async function RestaurantAdminPage({ searchParams }: { searchParams: Promise<Query> }) {
  await requirePlatformAdmin();
  const query = await searchParams;
  const listings = query.view === "listings";
  const view = listings ? "listings" : "applications";
  const status = typeof query.status === "string" ? query.status : "";
  const q = typeof query.q === "string" ? query.q.replaceAll("\0", "").trim().slice(0, 100) : "";
  const requestedPage = Number(query.page);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10_000) : 1;
  const options = listings ? { REQUESTED: "Publication requested", ...lifecycleLabels } : applicationLabels;
  let data: Awaited<ReturnType<typeof loadApplications | typeof loadListings>>;
  try {
    data = await (listings ? loadListings : loadApplications)(status, q, page);
  } catch {
    return <DatabaseUnavailable reference={reportDataError("restaurant-review-queue", new Error("Review queue lookup failed"))} />;
  }
  const pageHref = (n: number) => `/admin/restaurants?${new URLSearchParams({ view, status, q, page: String(n) })}`;

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight text-stone-950">{listings ? "Restaurant listings" : "Restaurant applications"}</h1>
      <p className="mt-2 text-sm leading-6 text-stone-600">{listings ? "Review publication requests and manage customer access." : "Review submissions, verify applicants, and track decisions."}</p>
      <form method="get" action="/admin/restaurants" className="mt-6 grid items-end gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:grid-cols-[1fr_13rem_auto]">
        <input name="view" type="hidden" value={view} />
        <label className="text-sm font-medium">Search<input name="q" type="search" defaultValue={q} maxLength={100} placeholder={listings ? "Restaurant, address, or slug" : "Restaurant, applicant, email, or address"} className="review-field" /></label>
        <label className="text-sm font-medium">Status<select name="status" defaultValue={Object.hasOwn(options, status) ? status : ""} className="review-field">
          <option value="">All statuses</option>
          {Object.entries(options).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <button type="submit" className="review-primary">Apply filters</button>
      </form>
      <section aria-label={listings ? "Listing results" : "Application results"} className="mt-5 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div className="border-b border-stone-200 bg-stone-50 px-5 py-3 text-sm font-medium text-stone-600">{data.count} {listings ? "listings" : "applications"}</div>
        {data.rows.length === 0 ? <div className="p-8 text-sm text-stone-700">
          <p className="font-semibold">{listings ? "No listings found" : "No applications found"}</p>
          <p className="mt-1">{q || status ? "Change the filters to see more results." : "New records will appear here."}</p>
        </div> : (
          <ul className="divide-y divide-stone-200">
            {data.rows.map((row) => (
              <li key={row.id} className="grid items-start gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_9rem_11rem] sm:items-center sm:gap-4">
                <div className="min-w-0 break-words">
                  <Link href={row.href} className="font-semibold text-emerald-900 hover:underline">{row.name}</Link>
                  <div className="mt-1 text-sm text-stone-600">{row.description}</div>
                  <div className="mt-1 text-xs text-stone-600">{row.secondary}</div>
                </div>
                <div><span className="review-badge">{row.badge}</span></div>
                <time dateTime={row.date.toISOString()} className="text-xs text-stone-600">{formatScheduledAt(row.date.toISOString())}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
      {(page > 1 || page * pageSize < data.count) && <nav aria-label="Result pages" className="mt-4 flex items-center gap-3 text-sm text-stone-700">
        {page > 1 && <Link href={pageHref(page - 1)} className="review-secondary">Previous</Link>}
        <span>Page {page}</span>
        {page * pageSize < data.count && page < 10_000 && <Link href={pageHref(page + 1)} className="review-secondary">Next</Link>}
      </nav>}
    </>
  );
}
