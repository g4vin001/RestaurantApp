import "server-only";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { validateOperatingSchedule } from "@/lib/domain/restaurant-schedule";
import { broadcastRestaurantInvalidation } from "@/lib/realtime/invalidation";
import { customerServices } from "@/lib/restaurants/customer-access";
import { RestaurantReviewError } from "@/lib/restaurants/review";
import type { ReviewActor } from "./restaurant-applications";
import { asRecord } from "./json-settings";
import { assertNoLiveListing, lockBusinessIdentity, restaurantBusinessKey } from "./restaurant-business-identity";

export async function getPublicationSetup(client: Prisma.TransactionClient, id: string) {
  const restaurant = await client.restaurant.findFirst({
    where: { id, archivedAt: null },
    select: {
      id: true, name: true, location: true, slug: true, revision: true, environment: true, lifecycle: true,
      publicationRequestedAt: true, publicationRequestedBy: true, operatingSettings: true,
      application: { select: { id: true } },
      floorPlans: {
        where: { archivedAt: null, activeVersionId: { not: null } },
        select: { activeVersion: { select: {
          status: true, publishedAt: true,
          _count: { select: { elements: { where: { type: "TABLE", visible: true, diningTable: { restaurantId: id, active: true, archivedAt: null } } } } },
        } } },
      },
      _count: { select: {
        diningTables: { where: { active: true, archivedAt: null } },
        staffRoles: { where: { archivedAt: null } },
        staffMembers: { where: { active: true, archivedAt: null, workAccessEnabled: true, staffRole: { archivedAt: { not: null } } } },
      } },
    },
  });
  if (!restaurant) return null;
  const settings = asRecord(restaurant.operatingSettings);
  const schedule = validateOperatingSchedule(settings?.schedule);
  const services = customerServices(settings);
  const checks = [
    { label: "Complete restaurant profile", complete: restaurant.name.trim().length >= 2 && restaurant.location.trim().length >= 10, info: "Set the restaurant name and complete business address." },
    { label: "Operating hours", complete: schedule.ok && Object.values(schedule.schedule.weekly).some((periods) => periods.length > 0), info: "Save a weekly schedule with at least one service period in Settings." },
    { label: "Configured tables", complete: restaurant._count.diningTables > 0, info: "Add dining tables in Floor plans." },
    { label: "Published floor plan", complete: restaurant.floorPlans.some(({ activeVersion }) => activeVersion?.status === "PUBLISHED" && Boolean(activeVersion.publishedAt) && activeVersion._count.elements > 0), info: "Publish a floor plan with at least one visible, active table." },
    { label: "Reservation and waitlist preferences", complete: services.configured, info: "Choose which services customers can use and save below." },
    { label: "Staff configuration, when applicable", complete: restaurant._count.staffRoles > 0 && restaurant._count.staffMembers === 0, info: "Keep a staff role available and update any enabled staff assigned to archived roles. Adding staff is optional." },
  ];
  return { restaurant, checks, services, ready: checks.every((check) => check.complete) };
}

type OwnerChange =
  | { action: "SERVICES"; reservations?: boolean; waitlist: boolean }
  | { action: "PUBLICATION_REQUESTED" };
type PlatformChange =
  | { action: "PUBLISHED" }
  | { action: "PUBLICATION_RETURNED" | "SUSPENDED" | "RESTORED"; message: string };

async function lockRestaurant(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "Restaurant" WHERE "id" = ${id}::uuid FOR UPDATE`;
}

export async function updateOwnerSetup(client: PrismaClient, actor: ReviewActor, restaurantId: string, change: OwnerChange) {
  return client.$transaction(async (tx) => {
    await lockRestaurant(tx, restaurantId);
    const membership = await tx.restaurantMembership.findFirst({
      where: { restaurantId, profileId: actor.id, role: "OWNER", active: true },
      select: { id: true },
    });
    if (!membership) throw new RestaurantReviewError("Only the restaurant owner can update this setup.");
    const setup = await getPublicationSetup(tx, restaurantId);
    if (!setup) throw new RestaurantReviewError("This restaurant is unavailable.");
    const { restaurant } = setup;
    if (restaurant.environment !== "LIVE") throw new RestaurantReviewError("Publication controls are available for live restaurants.");

    if (change.action === "SERVICES") {
      if ((restaurant.lifecycle === "SETUP") !== (change.reservations !== undefined)) {
        throw new RestaurantReviewError("The publication status changed. Refresh before updating customer preferences.");
      }
      const updated = await tx.restaurant.update({ where: { id: restaurant.id }, data: {
        operatingSettings: {
          ...(asRecord(restaurant.operatingSettings) as Prisma.InputJsonObject | null),
          ...(restaurant.lifecycle === "SETUP" ? { acceptsReservations: change.reservations } : {}),
          customerWaitlistEnabled: change.waitlist,
        },
        revision: { increment: 1 },
      }, select: { revision: true } });
      if (restaurant.lifecycle === "PUBLISHED") await broadcastRestaurantInvalidation(tx, {
        restaurantId: restaurant.id, restaurantSlug: restaurant.slug, environment: restaurant.environment,
        entity: "restaurant", revision: String(updated.revision),
      });
      return;
    }

    if (restaurant.lifecycle !== "SETUP") throw new RestaurantReviewError("Only a restaurant in setup can request publication.");
    if (restaurant.publicationRequestedAt) throw new RestaurantReviewError("A publication request is already awaiting review.");
    if (!setup.ready) throw new RestaurantReviewError("Complete the setup checklist before requesting publication.");
    await tx.restaurant.update({ where: { id: restaurant.id }, data: {
      publicationRequestedAt: new Date(), publicationRequestedBy: actor.id, revision: { increment: 1 },
    } });
    await tx.restaurantReviewEvent.create({ data: {
      applicationId: restaurant.application?.id, restaurantId, actorId: actor.id, actorEmail: actor.email,
      action: "PUBLICATION_REQUESTED", fromLifecycle: "SETUP", toLifecycle: "SETUP",
    } });
  });
}

export async function reviewRestaurantPublication(client: PrismaClient, actor: ReviewActor, id: string, revision: number, change: PlatformChange) {
  return client.$transaction(async (tx) => {
    await lockRestaurant(tx, id);
    const setup = await getPublicationSetup(tx, id);
    if (!setup || setup.restaurant.revision !== revision) {
      throw new RestaurantReviewError("This restaurant changed. Refresh its review page before continuing.");
    }
    const { restaurant } = setup;
    const from = restaurant.lifecycle;
    let to = from;
    if (change.action === "PUBLISHED" || change.action === "PUBLICATION_RETURNED") {
      if (restaurant.environment !== "LIVE" || from !== "SETUP" || !restaurant.publicationRequestedAt) {
        throw new RestaurantReviewError("An owner publication request is required.");
      }
      if (change.action === "PUBLISHED") {
        if (!setup.ready) throw new RestaurantReviewError("The restaurant must complete every mandatory setup item before publishing.");
        const owner = restaurant.publicationRequestedBy && await tx.restaurantMembership.findFirst({
          where: { restaurantId: id, role: "OWNER", active: true, profileId: restaurant.publicationRequestedBy },
          select: { id: true },
        });
        if (!owner) throw new RestaurantReviewError("An active owner is required to publish this restaurant.");
        const key = await restaurantBusinessKey(tx, restaurant.name, restaurant.location);
        await lockBusinessIdentity(tx, key);
        await assertNoLiveListing(tx, key, id);
        to = "PUBLISHED";
      }
    } else if (change.action === "SUSPENDED" && from === "PUBLISHED") {
      to = "SUSPENDED";
    } else if (change.action === "RESTORED" && from === "SUSPENDED") {
      if (restaurant.environment === "LIVE") {
        const key = await restaurantBusinessKey(tx, restaurant.name, restaurant.location);
        await lockBusinessIdentity(tx, key);
        await assertNoLiveListing(tx, key, id);
      }
      to = "PUBLISHED";
    } else {
      throw new RestaurantReviewError("This transition is no longer available.");
    }
    const updated = await tx.restaurant.update({ where: { id }, data: {
      lifecycle: to, publicationRequestedAt: null, publicationRequestedBy: null, revision: { increment: 1 },
    }, select: { revision: true } });
    const event = await tx.restaurantReviewEvent.create({ data: {
      applicationId: restaurant.application?.id, restaurantId: id, actorId: actor.id, actorEmail: actor.email,
      action: change.action, fromLifecycle: from, toLifecycle: to,
      message: "message" in change ? change.message : undefined,
      details: change.action === "PUBLISHED" ? { checks: setup.checks.map((check) => check.label) } : undefined,
    }, select: { id: true } });
    if (from !== to) await broadcastRestaurantInvalidation(tx, {
      restaurantId: id, restaurantSlug: restaurant.slug, environment: restaurant.environment,
      entity: "restaurant", revision: String(updated.revision), publicVisibilityChanged: true,
    });
    const owner = await tx.restaurantMembership.findFirst({
      where: { restaurantId: id, role: "OWNER", active: true, profileId: restaurant.publicationRequestedBy ?? undefined },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { profile: { select: { email: true } } },
    });
    return { eventId: event.id, applicantEmail: owner?.profile.email ?? null };
  });
}
