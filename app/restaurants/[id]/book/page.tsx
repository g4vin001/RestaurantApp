import { notFound, redirect } from "next/navigation";
import { DatabaseUnavailable } from "@/components/DatabaseUnavailable";
import { PageCard } from "@/components/PageCard";
import { ensureProfile } from "@/lib/auth/profile";
import { prisma } from "@/lib/prisma";
import { reportDataError } from "@/lib/server/data-error";
import { createClient } from "@/lib/supabase/server";
import { ReservationBookingForm } from "./ReservationBookingForm";

export default async function BookReservationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirectTo=${encodeURIComponent(`/restaurants/${slug}/book`)}`);
  }

  let profile: { displayName: string };
  let restaurant: { id: string; name: string } | null;
  try {
    profile = await ensureProfile(user);
    restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      select: { id: true, name: true },
    });
  } catch (error) {
    const reference = reportDataError("customer-booking-page", error);
    return <DatabaseUnavailable reference={reference} />;
  }

  if (!restaurant) notFound();

  return (
    <main className="mx-auto max-w-lg px-5 py-14">
      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
        Book a table
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-950">
        {restaurant.name}
      </h1>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        A table isn&apos;t assigned yet — the restaurant will seat you when you
        arrive.
      </p>
      <PageCard className="mt-6">
        <ReservationBookingForm
          restaurantId={restaurant.id}
          defaultPartyName={profile.displayName}
        />
      </PageCard>
    </main>
  );
}
