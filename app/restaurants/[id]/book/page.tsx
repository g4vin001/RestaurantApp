import { notFound, redirect } from "next/navigation";
import { DatabaseUnavailable } from "@/components/DatabaseUnavailable";
import { PageCard } from "@/components/PageCard";
import { ensureProfile } from "@/lib/auth/profile";
import { prisma } from "@/lib/prisma";
import { reportDataError } from "@/lib/server/data-error";
import { createClient } from "@/lib/supabase/server";
import { ReservationBookingForm } from "./ReservationBookingForm";
import { OpeningHours } from "@/components/customer/OpeningHours";
import { readOperatingSchedule, restaurantServiceStatus } from "@/lib/domain/restaurant-schedule";
import { asRecord } from "@/lib/repositories/prisma/json-settings";

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
  let restaurant: { id: string; name: string; timezone: string; operatingSettings: unknown } | null;
  try {
    profile = await ensureProfile(user);
    restaurant = await prisma.restaurant.findFirst({
      where: { slug, environment: "LIVE", archivedAt: null },
      select: { id: true, name: true, timezone: true, operatingSettings: true },
    });
  } catch (error) {
    const reference = reportDataError("customer-booking-page", error);
    return <DatabaseUnavailable reference={reference} />;
  }

  if (!restaurant) notFound();
  const schedule = readOperatingSchedule(asRecord(restaurant.operatingSettings) ?? {});

  return (
    <main className="mx-auto max-w-lg px-5 py-14">
      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
        Book a table
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-950">
        {restaurant.name}
      </h1>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Request a time during opening hours. The restaurant must approve your request before it is confirmed.
      </p>
      <div className="mt-6"><OpeningHours service={restaurantServiceStatus({ schedule, timezone: restaurant.timezone })} timeZone={restaurant.timezone} /></div>
      <PageCard className="mt-6">
        <ReservationBookingForm
          restaurantId={restaurant.id}
          defaultPartyName={profile.displayName}
          schedule={schedule}
          timeZone={restaurant.timezone}
        />
      </PageCard>
    </main>
  );
}
