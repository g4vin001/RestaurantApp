"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import {
  isAdminEmail,
  isAdminUnlocked,
  unlockAdminSession,
  verifyAdminPassword,
} from "@/lib/admin/auth";
import { createRestaurantSlug } from "@/lib/auth/restaurant-onboarding";
import { setFlash } from "@/lib/flash";
import { prisma } from "@/lib/prisma";
import {
  createRestaurantAsAdmin,
  deleteRestaurantAsAdmin,
} from "@/lib/repositories/prisma/admin-restaurants";
import { reportDataError } from "@/lib/server/data-error";
import { createClient } from "@/lib/supabase/server";

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

  if (!(await verifyAdminPassword(user.id, password))) {
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

export async function deleteRestaurantByAdmin(formData: FormData) {
  const user = await requireAdminUser();
  if (!(await isAdminUnlocked(user.id))) redirect("/admin");

  const restaurantId = formText(formData.get("restaurantId"));
  if (!restaurantId) {
    await setFlash("error", "Missing restaurant.");
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
    await deleteRestaurantAsAdmin(prisma, restaurantId);
  } catch (error) {
    const reference = reportDataError("admin-delete-restaurant", error);
    await setFlash("error", `Could not delete the restaurant. Support reference: ${reference}`);
    redirect("/admin");
  }

  await setFlash("message", `Restaurant "${restaurantName}" deleted.`);
  redirect("/admin");
}
