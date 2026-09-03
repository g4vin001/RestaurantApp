"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  isAdminEmail,
  isAdminUnlocked,
  unlockAdminSession,
  verifyAdminPassword,
} from "@/lib/admin/auth";
import { createRestaurantSlug } from "@/lib/auth/restaurant-onboarding";
import { ensureProfile } from "@/lib/auth/profile";
import { setFlash } from "@/lib/flash";
import { prisma } from "@/lib/prisma";
import { deleteAccountAsAdmin } from "@/lib/repositories/prisma/admin-accounts";
import { createRestaurantAsAdmin, setRestaurantArchivedAsAdmin } from "@/lib/repositories/prisma/admin-restaurants";
import { reportDataError } from "@/lib/server/data-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hashRequestAddress } from "@/lib/staff/invitations";
import { Prisma } from "@/lib/generated/prisma/client";

async function currentRequestIpHash() {
  const requestHeaders = await headers();
  const address =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    requestHeaders.get("x-real-ip") ??
    "unknown";
  return hashRequestAddress(address);
}

function formText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

async function requireAdminUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) redirect("/");
  return user;
}

export async function unlockAdminPanel(formData: FormData) {
  const user = await requireAdminUser();
  const password = (formData.get("password") as string) || "";
  await ensureProfile(user);
  const requestHeaders = await headers();
  const address = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? requestHeaders.get("x-real-ip") ?? "unknown";
  const ipHash = hashRequestAddress(address);
  const since = new Date(Date.now() - 15 * 60_000);
  const recentFailures = await prisma.adminAuthAttempt.count({
    where: {
      successful: false,
      attemptedAt: { gte: since },
      OR: [{ profileId: user.id }, { ipHash }],
    },
  });
  if (recentFailures >= 5) {
    await setFlash("error", "Too many failed attempts. Wait 15 minutes before trying again.");
    redirect("/admin");
  }

  const valid = await verifyAdminPassword(user.id, password);
  await prisma.adminAuthAttempt.create({
    data: { profileId: user.id, ipHash, successful: valid },
  });
  if (!valid) {
    await setFlash("error", "Incorrect admin password.");
    redirect("/admin");
  }

  await unlockAdminSession(user.id);
  redirect("/admin");
}

export async function createRestaurantByAdmin(formData: FormData) {
  const user = await requireAdminUser();
  if (!(await isAdminUnlocked(user.id))) redirect("/admin");

  const name = formText(formData.get("name"));
  const location = formText(formData.get("location"));
  const cuisineType = formText(formData.get("cuisineType"));
  const ownerEmail = formText(formData.get("ownerEmail")).toLowerCase();
  const environment = formData.get("environment") === "TEST" ? "TEST" : "LIVE";

  if (name.length < 2 || name.length > 80) {
    await setFlash("error", "Restaurant name must be between 2 and 80 characters.");
    redirect("/admin");
  }
  if (!ownerEmail) {
    await setFlash("error", "Owner email is required.");
    redirect("/admin");
  }

  let owner: { id: string } | null;
  try {
    owner = await prisma.profile.findUnique({ where: { email: ownerEmail }, select: { id: true } });
  } catch (error) {
    const reference = reportDataError("admin-create-restaurant-lookup", error);
    await setFlash("error", `Could not look up that email. Support reference: ${reference}`);
    redirect("/admin");
  }

  if (!owner) {
    await setFlash("error", `No Halina account found for ${ownerEmail}. They need to sign up first.`);
    redirect("/admin");
  }

  try {
    await createRestaurantAsAdmin(prisma, {
      ownerId: owner.id,
      name,
      location,
      cuisineType: cuisineType || undefined,
      slug: createRestaurantSlug(name, randomUUID().replaceAll("-", "").slice(0, 8)),
      environment,
    });
  } catch (error) {
    const reference = reportDataError("admin-create-restaurant", error);
    await setFlash("error", `Could not create the restaurant. Support reference: ${reference}`);
    redirect("/admin");
  }

  await setFlash("message", `Restaurant "${name}" created with ${ownerEmail} as owner.`);
  redirect("/admin");
}

export async function assignManagerByAdmin(formData: FormData) {
  const user = await requireAdminUser();
  if (!(await isAdminUnlocked(user.id))) redirect("/admin");

  const restaurantId = formText(formData.get("restaurantId"));
  const email = formText(formData.get("email")).toLowerCase();
  const role = formData.get("role") === "OWNER" ? "OWNER" : "MANAGER";

  if (!restaurantId || !email) {
    await setFlash("error", "Restaurant and email are required.");
    redirect("/admin");
  }

  let profile: { id: string } | null;
  try {
    profile = await prisma.profile.findUnique({ where: { email }, select: { id: true } });
  } catch (error) {
    const reference = reportDataError("admin-assign-manager-lookup", error);
    await setFlash("error", `Could not look up that email. Support reference: ${reference}`);
    redirect("/admin");
  }

  if (!profile) {
    await setFlash("error", `No Halina account found for ${email}. They need to sign up first.`);
    redirect("/admin");
  }

  try {
    await prisma.restaurantMembership.upsert({
      where: { restaurantId_profileId: { restaurantId, profileId: profile.id } },
      create: { restaurantId, profileId: profile.id, role, active: true },
      update: { role, active: true },
    });
  } catch (error) {
    const reference = reportDataError("admin-assign-manager", error);
    await setFlash("error", `Could not assign that membership. Support reference: ${reference}`);
    redirect("/admin");
  }

  await setFlash(
    "message",
    `${email} is now ${role === "OWNER" ? "an owner" : "a manager"} of that restaurant.`,
  );
  redirect("/admin");
}

export async function updateRestaurantByAdmin(formData: FormData) {
  const user = await requireAdminUser();
  if (!(await isAdminUnlocked(user.id))) redirect("/admin");

  const restaurantId = formText(formData.get("restaurantId"));
  const name = formText(formData.get("name"));
  const location = formText(formData.get("location"));
  const cuisineType = formText(formData.get("cuisineType"));

  if (!restaurantId) {
    await setFlash("error", "Missing restaurant.");
    redirect("/admin");
  }
  if (name.length < 2 || name.length > 80) {
    await setFlash("error", "Restaurant name must be between 2 and 80 characters.");
    redirect("/admin");
  }

  try {
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { name, location, cuisineType: cuisineType || null },
    });
  } catch (error) {
    const reference = reportDataError("admin-update-restaurant", error);
    await setFlash("error", `Could not update the restaurant. Support reference: ${reference}`);
    redirect("/admin");
  }

  await setFlash("message", `Restaurant "${name}" updated.`);
  redirect("/admin");
}

export async function setRestaurantArchivedByAdmin(formData: FormData) {
  const user = await requireAdminUser();
  if (!(await isAdminUnlocked(user.id))) redirect("/admin");

  const restaurantId = formText(formData.get("restaurantId"));
  const confirmation = formText(formData.get("confirmation"));
  const reason = formText(formData.get("reason"));
  const archived = formData.get("archived") === "true";
  if (!restaurantId) {
    await setFlash("error", "Missing restaurant.");
    redirect("/admin");
  }

  if (reason.length < 4 || reason.length > 500) {
    await setFlash("error", "Enter a short audit reason (4-500 characters).");
    redirect("/admin");
  }
  let restaurantName: string;
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true },
    });
    if (!restaurant) {
      await setFlash("error", "That restaurant no longer exists.");
      redirect("/admin");
    }
    restaurantName = restaurant.name;
    if (confirmation !== restaurant.name) {
      await setFlash("error", `Type "${restaurant.name}" exactly to confirm.`);
      redirect("/admin");
    }
    const requestHeaders = await headers();
    const address = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? requestHeaders.get("x-real-ip") ?? "unknown";
    await setRestaurantArchivedAsAdmin(prisma, {
      restaurantId,
      actorProfileId: user.id,
      archived,
      reason,
      ipHash: hashRequestAddress(address),
    });
  } catch (error) {
    const reference = reportDataError("admin-archive-restaurant", error);
    await setFlash("error", `Could not update the restaurant archive. Support reference: ${reference}`);
    redirect("/admin");
  }

  await setFlash("message", `Restaurant "${restaurantName}" ${archived ? "archived" : "restored"}.`);
  redirect("/admin");
}

export async function deleteAccountByAdmin(formData: FormData) {
  const user = await requireAdminUser();
  if (!(await isAdminUnlocked(user.id))) redirect("/admin");

  const profileId = formText(formData.get("profileId"));
  const confirmation = formText(formData.get("confirmation")).toLowerCase();
  const reason = formText(formData.get("reason"));

  if (!profileId) {
    await setFlash("error", "Missing account.");
    redirect("/admin");
  }
  if (profileId === user.id) {
    await setFlash("error", "You can't delete the admin account you're signed in as.");
    redirect("/admin");
  }
  if (reason.length < 4 || reason.length > 500) {
    await setFlash("error", "Enter a short audit reason (4-500 characters).");
    redirect("/admin");
  }

  const target = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { email: true },
  });
  if (!target) {
    await setFlash("error", "That account no longer exists.");
    redirect("/admin");
  }
  if (confirmation !== target.email.toLowerCase()) {
    await setFlash("error", `Type "${target.email}" exactly to confirm.`);
    redirect("/admin");
  }

  try {
    await deleteAccountAsAdmin(prisma, {
      profileId,
      actorProfileId: user.id,
      reason,
      ipHash: await currentRequestIpHash(),
    });
  } catch (error) {
    if (error instanceof Error && !(error instanceof Prisma.PrismaClientKnownRequestError)) {
      await setFlash("error", error.message);
      redirect("/admin");
    }
    const reference = reportDataError("admin-delete-account", error);
    await setFlash("error", `Could not delete the account. Support reference: ${reference}`);
    redirect("/admin");
  }

  // The app-data row is gone at this point; the login itself is removed
  // separately since Supabase Auth isn't part of the database transaction
  // above. If this step fails, the account's data is already deleted but
  // they could still log in — which would silently recreate a bare Profile
  // via ensureProfile()'s upsert — so this failure needs its own clear flag.
  try {
    const admin = createAdminClient();
    const { error: authError } = await admin.auth.admin.deleteUser(profileId);
    if (authError) throw authError;
  } catch (error) {
    const reference = reportDataError("admin-delete-account-auth", error);
    await setFlash(
      "error",
      `Account data for "${target.email}" was deleted, but removing their login failed — they can still log back in. Support reference: ${reference}`,
    );
    redirect("/admin");
  }

  await setFlash("message", `Account "${target.email}" was permanently deleted.`);
  redirect("/admin");
}
