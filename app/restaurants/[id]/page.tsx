import { notFound } from "next/navigation";
import { CustomerDataUnavailable } from "@/components/customer/CustomerDataUnavailable";
import { LiveRestaurantDetail } from "@/components/customer/LiveRestaurantDetail";
import { getCachedPublicRestaurantBySlug } from "@/lib/repositories/prisma/public-restaurant-cache";
import { reportDataError } from "@/lib/server/data-error";

export const dynamic = "force-dynamic";

export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: slug } = await params;

  let view: Awaited<ReturnType<typeof getCachedPublicRestaurantBySlug>>;
  try {
    view = await getCachedPublicRestaurantBySlug(slug);
  } catch (error) {
    const reference = reportDataError("public-restaurant-view", error);
    return <CustomerDataUnavailable reference={reference} />;
  }

  if (!view) notFound();

  return <LiveRestaurantDetail restaurant={view} slug={slug} />;
}
