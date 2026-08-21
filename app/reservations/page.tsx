import { redirect } from "next/navigation";
import { DatabaseUnavailable } from "@/components/DatabaseUnavailable";
import { PageCard } from "@/components/PageCard";
import { StatusBadge } from "@/components/StatusBadge";
import { formatScheduledAt, reservationStatusLabel } from "@/lib/helpers";
import { prisma } from "@/lib/prisma";
import {
  fetchCustomerReservations,
  type CustomerReservation,
} from "@/lib/repositories/prisma/customer-reservations";
import { reportDataError } from "@/lib/server/data-error";
import { createClient } from "@/lib/supabase/server";

export default async function MyReservationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/reservations");

  let reservations: CustomerReservation[];
  try {
    reservations = await fetchCustomerReservations(prisma, user.id);
  } catch (error) {
    const reference = reportDataError("customer-reservations-list", error);
    return <DatabaseUnavailable reference={reference} />;
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <h1 className="text-2xl font-bold text-emerald-800">Your reservations</h1>
      {reservations.length === 0 ? (
        <p className="mt-4 text-sm text-stone-500">
          You haven&apos;t booked a table yet.
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {reservations.map((reservation) => (
            <PageCard key={reservation.id}>
              <div className="flex items-start justify-between gap-4">
                <h2 className="font-semibold">{reservation.restaurantName}</h2>
                <StatusBadge
                  status={reservation.status}
                  label={reservationStatusLabel(reservation.status)}
                />
              </div>
              <p className="mt-2 text-sm text-stone-600">
                {reservation.partyName} · {reservation.partySize}{" "}
                {reservation.partySize === 1 ? "guest" : "guests"}
              </p>
              <p className="mt-1 text-sm text-stone-500">
                Reservation for: {formatScheduledAt(reservation.scheduledAt)}
              </p>
            </PageCard>
          ))}
        </div>
      )}
    </main>
  );
}
