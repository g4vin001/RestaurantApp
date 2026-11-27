import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { RestaurantReviewError } from "@/lib/restaurants/review";

export async function restaurantBusinessKey(tx: Prisma.TransactionClient, name: string, address: string) {
  const [{ key }] = await tx.$queryRaw<Array<{ key: string }>>`
    SELECT private.halina_business_identity(${name}, ${address}) AS "key"
  `;
  return key;
}

export async function lockBusinessIdentity(tx: Prisma.TransactionClient, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 47201))`;
}

export async function assertNoLiveListing(tx: Prisma.TransactionClient, key: string, excludingId?: string) {
  const existing = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Restaurant"
    WHERE "environment" = 'LIVE' AND "archivedAt" IS NULL
      AND private.halina_business_identity("name", "location") = ${key}
      ${excludingId ? Prisma.sql`AND "id" <> ${excludingId}::uuid` : Prisma.empty}
    LIMIT 1
  `;
  if (existing.length) {
    throw new RestaurantReviewError("A restaurant already has this name and address. Resolve the existing listing before proceeding.");
  }
}
