import { asRecord } from "@/lib/repositories/prisma/json-settings";

export const publicRestaurantScope = { environment: "LIVE", lifecycle: "PUBLISHED", archivedAt: null } as const;

export function customerServices(operatingSettings: unknown) {
  const settings = asRecord(operatingSettings);
  return {
    reservations: settings?.acceptsReservations !== false,
    waitlist: settings?.customerWaitlistEnabled !== false,
    configured: typeof settings?.acceptsReservations === "boolean" && typeof settings?.customerWaitlistEnabled === "boolean",
  };
}
