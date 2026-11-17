import { notFound } from "next/navigation";
import { CustomerDataUnavailable } from "@/components/customer/CustomerDataUnavailable";
import { LiveRestaurantDetail } from "@/components/customer/LiveRestaurantDetail";
import { prisma } from "@/lib/prisma";
import { fetchPublicRestaurantBySlug } from "@/lib/repositories/prisma/public-restaurant-view";
import { reportDataError } from "@/lib/server/data-error";

export const dynamic = "force-dynamic";

export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: slug } = await params;

  let view: Awaited<ReturnType<typeof fetchPublicRestaurantBySlug>>;
  try {
    view = await fetchPublicRestaurantBySlug(prisma, slug);
  } catch (error) {
    const reference = reportDataError("public-restaurant-view", error);
    return <CustomerDataUnavailable reference={reference} />;
  }

  if (!view) notFound();

  return <LiveRestaurantDetail restaurant={view} slug={slug} />;
}
