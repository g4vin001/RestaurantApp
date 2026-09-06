import { notFound } from "next/navigation";
import { DatabaseUnavailable } from "@/components/DatabaseUnavailable";
import { LiveRestaurantDetail } from "@/components/customer/LiveRestaurantDetail";
import { getCachedPublicRestaurantBySlug } from "@/lib/repositories/prisma/public-restaurant-cache";
import { reportDataError } from "@/lib/server/data-error";

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
    return <DatabaseUnavailable reference={reference} />;
  }

  if (!view) notFound();

  return <LiveRestaurantDetail restaurant={view} slug={slug} />;
}
