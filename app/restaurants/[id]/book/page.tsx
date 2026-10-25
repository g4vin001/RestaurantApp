import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DatabaseUnavailable } from "@/components/DatabaseUnavailable";
import { PageCard } from "@/components/PageCard";
import { ensureProfile } from "@/lib/auth/profile";
import { prisma } from "@/lib/prisma";
import { reportDataError } from "@/lib/server/data-error";
import { createClient } from "@/lib/supabase/server";
import { ReservationBookingForm } from "./ReservationBookingForm";
import { OpeningHours } from "@/components/customer/OpeningHours";
import {
  readOperatingSchedule,
  readReservationAvailability,
  readReservationDurationMinutes,
  readReservationNotes,
  readReservationWindows,
  restaurantServiceStatus,
} from "@/lib/domain/restaurant-schedule";
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
  const availability = readReservationAvailability(asRecord(restaurant.operatingSettings));
  const reservationNotes = readReservationNotes(asRecord(restaurant.operatingSettings));

  // The detail page hides the button, but this URL can still be opened directly.
  if (!availability.acceptsReservations) {
    return (
      <main className="mx-auto max-w-lg px-5 py-14">
        <h1 className="text-3xl font-bold tracking-tight text-stone-950">{restaurant.name}</h1>
        <PageCard className="mt-6">
          <h2 className="font-semibold text-stone-900">Online reservations are closed</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            This restaurant isn&apos;t taking online reservations right now. You can still join the walk-in waitlist during opening hours.
          </p>
          <Link href={`/restaurants/${slug}`} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800">← Back to {restaurant.name}</Link>
        </PageCard>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-14">
      <Link href={`/restaurants/${slug}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800">
        ← Back to {restaurant.name}
      </Link>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-emerald-700">
        Book a table
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-950">
        {restaurant.name}
      </h1>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Request a time during opening hours. The restaurant must approve your request before it is confirmed.
      </p>
      <div className="mt-6"><OpeningHours service={restaurantServiceStatus({ schedule, timezone: restaurant.timezone })} timeZone={restaurant.timezone} /></div>
      {reservationNotes && (
        <section aria-label="Notes from the restaurant" className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-sky-900">Before you book</h2>
          <p className="mt-1 whitespace-pre-line text-sm leading-6 text-sky-950">{reservationNotes}</p>
        </section>
      )}
      <PageCard className="mt-6">
        <ReservationBookingForm
          restaurantId={restaurant.id}
          defaultPartyName={profile.displayName}
          schedule={schedule}
          reservationDurationMinutes={readReservationDurationMinutes(asRecord(restaurant.operatingSettings))}
          blockedDates={availability.blockedDates}
          reservationWindows={readReservationWindows(asRecord(restaurant.operatingSettings))}
          timeZone={restaurant.timezone}
        />
      </PageCard>
    </main>
  );
}
