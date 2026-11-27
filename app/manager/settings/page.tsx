import Link from "next/link";
import { RestaurantSettings } from "@/components/manager/RestaurantSettings";
import { getCurrentAuthIdentity } from "@/lib/auth/current-identity";
import { getActiveManagerMembership } from "@/lib/auth/manager-membership";

export default async function RestaurantSettingsPage() {
  const user = process.env.NEXT_PUBLIC_HALINA_DEMO_MODE === "true" ? null : await getCurrentAuthIdentity();
  const membership = user ? await getActiveManagerMembership(user.id) : null;
  return <>
    {membership?.restaurant.environment === "LIVE" && <Link href="/manager/setup" className="review-secondary mb-4">Restaurant publication and customer services</Link>}
    <RestaurantSettings verifiedIdentity={Boolean(membership?.restaurant.application?.emailVerifiedAt)} />
  </>;
}
