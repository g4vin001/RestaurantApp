import "server-only";
import { reportDataError } from "@/lib/server/data-error";
import { Prisma } from "@/lib/generated/prisma/client";
import { RestaurantReviewError } from "./review";

export function reviewError(context: string, error: unknown, fallback: string) {
  if (error instanceof RestaurantReviewError) return error.message;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
    return "A concurrent change interrupted this update. Refresh the page and try again.";
  }
  // Prisma errors can contain submitted fields or document bytes.
  const safeError = new Error(error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "Unexpected review error");
  const reference = reportDataError(context, safeError);
  return `${fallback} Support reference: ${reference}`;
}
