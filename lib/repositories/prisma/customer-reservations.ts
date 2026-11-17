import "server-only";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { OperationsRepositoryError } from "@/lib/repositories/operations";
import { overlappingReservationStarts } from "@/lib/domain/booking-conflicts";
import { reservationNoticeError } from "@/lib/customer/reservation-booking";
import {
  fitsWithinServiceHours,
  formatDurationMinutes,
  isReservationDateBlocked,
  isWithinReservationWindows,
  isWithinServiceHours,
  readReservationAvailability,
  readReservationDurationMinutes,
  readReservationLeadMinutes,
  readReservationNotes,
  readReservationWindows,
  reservationWindowLabels,
} from "@/lib/domain/restaurant-schedule";
import { restaurantDateKey } from "@/lib/time/restaurant-time";
import { asRecord } from "@/lib/repositories/prisma/json-settings";
import { loadPublishedFloors } from "@/lib/repositories/prisma/published-floors";

export type CreateCustomerReservationInput = {
  restaurantId: string;
  customerProfileId: string;
  partyName: string;
  partySize: number;
  scheduledAt: Date;
  requestedAt?: Date;
  contact?: string;
  notes?: string;
};

export type CreateCustomerReservationResult = { reservationId: string };

export type CustomerReservation = {
  id: string;
  restaurantName: string;
  restaurantSlug: string;
  restaurantTimezone: string;
  restaurantNotes: string;
  partyName: string;
  partySize: number;
  scheduledAt: Date;
  status: string;
  cancellationReason: string | null;
  customerNote: string | null;
};

export async function fetchCustomerReservations(
  client: PrismaClient,
  customerProfileId: string,
): Promise<CustomerReservation[]> {
  const reservations = await client.reservation.findMany({
    where: { customerProfileId },
    select: {
      id: true,
      partyName: true,
      partySize: true,
      scheduledAt: true,
      status: true,
      cancellationReason: true,
      customerNote: true,
      restaurant: { select: { name: true, slug: true, timezone: true, operatingSettings: true } },
    },
    orderBy: { scheduledAt: "desc" },
  });

  return reservations.map((reservation) => ({
    id: reservation.id,
    restaurantName: reservation.restaurant.name,
    restaurantSlug: reservation.restaurant.slug,
    restaurantNotes: readReservationNotes(asRecord(reservation.restaurant.operatingSettings)),
    restaurantTimezone: reservation.restaurant.timezone || "Asia/Manila",
    partyName: reservation.partyName,
    partySize: reservation.partySize,
    scheduledAt: reservation.scheduledAt,
    status: reservation.status,
    cancellationReason: reservation.cancellationReason,
    customerNote: reservation.customerNote,
  }));
}

// Matches the ±reservation-length heuristic used by the manager-side domain
// layer (lib/domain/operations.ts's reservationConflict) — kept consistent
// rather than inventing a different overlap model.
// Includes PENDING_APPROVAL — an unreviewed booking still holds a claim on
// capacity, otherwise a customer could stack multiple pending requests past
// what the restaurant can actually seat.
const ACTIVE_STATUSES = ["PENDING_APPROVAL", "CONFIRMED", "ARRIVED", "SEATED"] as const;
const MAX_ATTEMPTS = 3;

async function attemptCreate(
  client: PrismaClient,
  input: CreateCustomerReservationInput,
): Promise<CreateCustomerReservationResult> {
  return client.$transaction(
    async (tx) => {
      // Capacity is a restaurant-wide invariant. Lock one durable tenant row
      // before reading the aggregate so two simultaneous customer requests
      // cannot both observe the same remaining seats and overbook them.
      // READ COMMITTED gives the waiter a fresh snapshot after the first
      // transaction releases this row lock.
      const restaurant = await tx.$queryRaw<Array<{ id: string; timezone: string; operatingSettings: unknown }>>(Prisma.sql`
        SELECT "id", "timezone", "operatingSettings"
        FROM "Restaurant"
        WHERE "id" = ${input.restaurantId}::uuid
          AND "environment" = 'LIVE'::"RestaurantEnvironment"
          AND "archivedAt" IS NULL
        FOR UPDATE
      `);
      if (!restaurant.length) {
        throw new OperationsRepositoryError(
          "VALIDATION",
          "This restaurant is no longer available.",
        );
      }
      const settings = asRecord(restaurant[0].operatingSettings);
      if (input.requestedAt) {
        const noticeError = reservationNoticeError(input.scheduledAt, input.requestedAt, readReservationLeadMinutes(settings));
        if (noticeError) throw new OperationsRepositoryError("VALIDATION", noticeError);
      }
      // Read under the row lock, so a manager turning reservations off or
      // blocking this date is never raced by a request saved just after it.
      const availability = readReservationAvailability(settings);
      if (!availability.acceptsReservations) {
        throw new OperationsRepositoryError("VALIDATION", "This restaurant isn't taking online reservations right now.");
      }
      if (isReservationDateBlocked(availability.blockedDates, input.scheduledAt, restaurant[0].timezone)) {
        throw new OperationsRepositoryError("VALIDATION", "This restaurant isn't taking reservations on that date. Choose another day.");
      }
      const reservationMinutes = readReservationDurationMinutes(settings);
      const schedule = { ...settings, timezone: restaurant[0].timezone };
      if (!isWithinServiceHours(schedule, input.scheduledAt)) {
        throw new OperationsRepositoryError("VALIDATION", "This restaurant is closed at that time. Choose a time within its opening hours.");
      }
      const windows = readReservationWindows(settings);
      if (!isWithinReservationWindows(windows, input.scheduledAt, restaurant[0].timezone)) {
        const labels = windows ? reservationWindowLabels(windows, restaurantDateKey(input.scheduledAt, restaurant[0].timezone)) : [];
        throw new OperationsRepositoryError(
          "VALIDATION",
          labels.length
            ? `Reservations that day can start ${labels.join(" or ")}. Choose a time in one of those windows.`
            : "This restaurant isn't taking reservations at that time of day. Choose another day or time.",
        );
      }
      if (!fitsWithinServiceHours(schedule, input.scheduledAt, reservationMinutes)) {
        const length = formatDurationMinutes(reservationMinutes);
        throw new OperationsRepositoryError("VALIDATION", `Reservations here last ${length} and must finish by closing time. Choose a start at least ${length} before the restaurant closes.`);
      }

      const [tables, floors, booked] = await Promise.all([
        tx.diningTable.findMany({
          where: { restaurantId: input.restaurantId, active: true, archivedAt: null, currentStatus: { not: "OUT_OF_SERVICE" } },
          select: { id: true, capacity: true, zone: true },
        }),
        loadPublishedFloors(tx, input.restaurantId),
        tx.reservation.findMany({
          where: {
            restaurantId: input.restaurantId,
            status: { in: [...ACTIVE_STATUSES] },
            scheduledAt: overlappingReservationStarts(input.scheduledAt, reservationMinutes),
          },
          select: {
            partySize: true,
            assignedTableId: true,
            seatingAssignments: {
              where: { status: "ACTIVE" },
              select: { tables: { select: { diningTableId: true } } },
            },
          },
        }),
      ]);
      const totalCapacity = tables.reduce((total, table) => total + table.capacity, 0);
      const bookedPartySize = booked.reduce((total, booking) => total + booking.partySize, 0);
      const floorIds = new Map(floors.flatMap((floor) => floor.tableIds.map((id) => [id, floor.id] as const)));
      const assignedTableIds = new Set(booked.flatMap((booking) => [
        booking.assignedTableId,
        ...booking.seatingAssignments.flatMap((assignment) => assignment.tables.map((table) => table.diningTableId)),
      ]));
      const seatingAreas = Map.groupBy(
        tables.filter((table) => !assignedTableIds.has(table.id)),
        (table) => JSON.stringify([floorIds.get(table.id) ?? null, table.zone]),
      );
      const fits = Array.from(seatingAreas.values()).some((area) => {
        const [largest = 0, next = 0] = area.map((table) => table.capacity).sort((a, b) => b - a);
        return largest >= input.partySize || (input.partySize >= 3 && largest + next >= input.partySize);
      });

      if (!fits || bookedPartySize + input.partySize > totalCapacity) {
        throw new OperationsRepositoryError(
          "CONFLICT",
          "This restaurant is fully booked around that time. Try a different time or a smaller party.",
        );
      }

      const created = await tx.reservation.create({
        data: {
          restaurantId: input.restaurantId,
          partyName: input.partyName,
          partySize: input.partySize,
          contact: input.contact,
          notes: input.notes,
          scheduledAt: input.scheduledAt,
          status: "PENDING_APPROVAL",
          customerProfileId: input.customerProfileId,
        },
        select: { id: true },
      });
      await tx.restaurant.update({
        where: { id: input.restaurantId },
        data: { lastOperationalUpdateAt: new Date() },
      });

      return { reservationId: created.id };
    },
    { isolationLevel: "ReadCommitted" },
  );
}

// Deadlocks or transient write conflicts may still surface as P2034. Retrying
// reacquires the tenant row lock, while business rejections are never retried.
export async function createCustomerReservation(
  client: PrismaClient,
  input: CreateCustomerReservationInput,
): Promise<CreateCustomerReservationResult> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await attemptCreate(client, input);
    } catch (error) {
      if (error instanceof OperationsRepositoryError) throw error;
      const isSerializationFailure =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!isSerializationFailure || attempt === MAX_ATTEMPTS) {
        throw new OperationsRepositoryError(
          "PERSISTENCE",
          "Halina could not save this reservation. Please try again.",
          { cause: error },
        );
      }
    }
  }
  throw new OperationsRepositoryError("PERSISTENCE", "Halina could not save this reservation.");
}
