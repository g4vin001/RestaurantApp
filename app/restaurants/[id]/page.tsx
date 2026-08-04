import { notFound } from "next/navigation";
import { CustomerRestaurantDetail } from "@/components/customer/CustomerRestaurantDetail";
import { restaurants } from "@/lib/mock-data";

export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const restaurant = restaurants.find((item) => item.id === id);
  if (!restaurant) notFound();
  return <CustomerRestaurantDetail restaurant={restaurant} />;
}
