import { redirect } from "next/navigation";
import { PageCard } from "@/components/PageCard";
import { DatabaseUnavailable } from "@/components/DatabaseUnavailable";
import { getCurrentAuthIdentity } from "@/lib/auth/current-identity";
import { getActiveManagerMembership } from "@/lib/auth/manager-membership";
import { prisma } from "@/lib/prisma";
import { reportDataError } from "@/lib/server/data-error";
import { RestaurantSetupForm } from "./RestaurantSetupForm";

export default async function RestaurantOnboardingPage() {
  if (process.env.NEXT_PUBLIC_HALINA_DEMO_MODE === "true") {
    redirect("/manager");
  }

  const user = await getCurrentAuthIdentity();

  if (!user) redirect("/login?redirectTo=/onboarding/restaurant");

  let membership;
  let application;
  try {
    [membership, application] = await Promise.all([
      getActiveManagerMembership(user.id),
      prisma.restaurantApplication.findUnique({
        where: { applicantId: user.id },
        select: { status: true, name: true, location: true, mapsUrl: true },
      }),
    ]);
  } catch (error) {
    const reference = reportDataError("onboarding-membership", error);
    return <DatabaseUnavailable reference={reference} />;
  }
  if (membership) redirect("/manager");

  return (
    <main className="mx-auto max-w-lg px-5 py-14">
      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
        Restaurant listing
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-950">
        Apply to list a restaurant
      </h1>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        A Halina admin reviews your restaurant and location before granting manager access.
      </p>
      <PageCard className="mt-6">
        {application?.status === "PENDING" ? (
          <p role="status" className="text-sm text-stone-700">{application.name} is awaiting review.</p>
        ) : application?.status === "APPROVED" ? (
          <p role="status" className="text-sm text-stone-700">Your application was approved. Contact Halina support if you no longer have access to the restaurant.</p>
        ) : (
          <>
            {application?.status === "DECLINED" && <p role="status" className="text-sm text-stone-700">Your previous application was declined. You can submit updated details.</p>}
            <RestaurantSetupForm defaults={application ?? undefined} />
          </>
        )}
      </PageCard>
    </main>
  );
}
