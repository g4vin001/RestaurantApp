import "server-only";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { OperationsRepositoryError } from "@/lib/repositories/operations";

export type CreateCustomerReservationInput = {
  restaurantId: string;
  customerProfileId: string;
  partyName: string;
  partySize: number;
  scheduledAt: Date;
  contact?: string;
  notes?: string;
};

export type CreateCustomerReservationResult = { reservationId: string };

export type CustomerReservation = {
  id: string;
  restaurantName: string;
  partyName: string;
  partySize: number;
  scheduledAt: Date;
  status: string;
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
      restaurant: { select: { name: true } },
    },
    orderBy: { scheduledAt: "desc" },
  });

  return reservations.map((reservation) => ({
    id: reservation.id,
    restaurantName: reservation.restaurant.name,
    partyName: reservation.partyName,
    partySize: reservation.partySize,
    scheduledAt: reservation.scheduledAt,
    status: reservation.status,
  }));
}

// Matches the ±90min heuristic already used by the manager-side domain layer
// (lib/domain/operations.ts's reservationConflict) — kept consistent rather
// than inventing a different overlap model.
const OVERLAP_WINDOW_MS = 90 * 60_000;
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
      const restaurant = await tx.restaurant.findUnique({
        where: { id: input.restaurantId },
        select: { id: true },
      });
      if (!restaurant) {
        throw new OperationsRepositoryError(
          "VALIDATION",
          "This restaurant is no longer available.",
        );
      }

      const capacity = await tx.diningTable.aggregate({
        where: { restaurantId: input.restaurantId, active: true, archivedAt: null },
        _sum: { capacity: true },
      });
      const totalCapacity = capacity._sum.capacity ?? 0;

      const windowStart = new Date(input.scheduledAt.getTime() - OVERLAP_WINDOW_MS);
      const windowEnd = new Date(input.scheduledAt.getTime() + OVERLAP_WINDOW_MS);

      const booked = await tx.reservation.aggregate({
        where: {
          restaurantId: input.restaurantId,
          status: { in: [...ACTIVE_STATUSES] },
          scheduledAt: { gte: windowStart, lte: windowEnd },
        },
        _sum: { partySize: true },
      });
      const bookedPartySize = booked._sum.partySize ?? 0;

      if (totalCapacity === 0 || bookedPartySize + input.partySize > totalCapacity) {
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

      return { reservationId: created.id };
    },
    { isolationLevel: "Serializable" },
  );
}

// Postgres SERIALIZABLE aborts one of two genuinely-conflicting concurrent
// transactions with a 40001 error (Prisma code P2034) rather than blocking —
// retrying lets the loser re-run and correctly see the winner's committed
// row. Business rejections (CONFLICT/VALIDATION) are never retried.
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
