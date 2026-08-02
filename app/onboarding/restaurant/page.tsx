import { redirect } from "next/navigation";
import { PageCard } from "@/components/PageCard";
import { getActiveManagerMembership } from "@/lib/auth/manager-membership";
import { createClient } from "@/lib/supabase/server";
import { RestaurantSetupForm } from "./RestaurantSetupForm";

export default async function RestaurantOnboardingPage() {
  if (process.env.NEXT_PUBLIC_HALINA_DEMO_MODE === "true") {
    redirect("/manager");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/onboarding/restaurant");

  const membership = await getActiveManagerMembership(user.id);
  if (membership) redirect("/manager");

  return (
    <main className="mx-auto max-w-lg px-5 py-14">
      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
        Manager setup
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-950">
        Create your restaurant
      </h1>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        This creates a new restaurant that you own. Joining an existing
        restaurant requires an invitation and cannot be done by entering its
        name.
      </p>
      <PageCard className="mt-6">
        <RestaurantSetupForm />
      </PageCard>
    </main>
  );
}
