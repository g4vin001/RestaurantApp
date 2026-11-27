import type { RestaurantApplicationStatus, RestaurantLifecycle, RestaurantReviewAction } from "@/lib/generated/prisma/enums";

export const applicationLabels: Record<RestaurantApplicationStatus, string> = {
  PENDING: "Pending",
  NEEDS_INFORMATION: "Needs information",
  APPROVED: "Approved",
  DECLINED: "Declined",
};

export const lifecycleLabels: Record<RestaurantLifecycle, string> = {
  SETUP: "In setup",
  PUBLISHED: "Published",
  SUSPENDED: "Suspended",
};

export const reviewEventLabels: Record<RestaurantReviewAction, string> = {
  SUBMITTED: "Application received",
  RESUBMITTED: "Updated application received",
  INFORMATION_REQUESTED: "Information requested",
  NOTE_ADDED: "Internal note added",
  APPROVED: "Application approved",
  DECLINED: "Application declined",
  PUBLICATION_REQUESTED: "Publication requested",
  PUBLICATION_RETURNED: "Publication returned for changes",
  PUBLISHED: "Restaurant published",
  SUSPENDED: "Restaurant suspended",
  RESTORED: "Restaurant restored",
};

export const approvalChecks = [
  ["emailVerified", "Applicant email has been verified"],
  ["existence", "Restaurant existence has been confirmed"],
  ["location", "Restaurant location matches the submission"],
  ["authority", "Applicant is authorized to represent the restaurant"],
  ["contact", "Restaurant contact information has been verified"],
  ["duplicates", "No unresolved duplicate listing exists"],
] as const;

export class RestaurantReviewError extends Error {}

export function reviewUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

export function formRevision(value: FormDataEntryValue | null) {
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed > 2_147_483_647) {
    throw new RestaurantReviewError("Refresh this page before saving.");
  }
  return parsed;
}

export function formMessage(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < 4 || text.length > 2000 || text.includes("\0")) {
    throw new RestaurantReviewError("Enter a message between 4 and 2,000 characters.");
  }
  return text;
}
