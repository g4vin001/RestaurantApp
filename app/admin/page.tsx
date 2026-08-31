import Link from "next/link";
import { notFound } from "next/navigation";
import { PageCard } from "@/components/PageCard";
import { isAdminEmail, isAdminUnlocked } from "@/lib/admin/auth";
import { readFlash } from "@/lib/flash";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  assignManagerByAdmin,
  createRestaurantByAdmin,
  unlockAdminPanel,
  updateRestaurantByAdmin,
} from "./actions";
import { ArchiveRestaurantButton } from "./DeleteRestaurantButton";

const inputClass =
  "mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm";
const labelClass = "text-sm font-medium text-stone-700";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Indistinguishable from a real 404 for anyone but the allowlisted admin
  // account — no redirect-to-login that would reveal this route exists.
  if (!user || !isAdminEmail(user.email)) notFound();

  const [error, message] = await Promise.all([readFlash("error"), readFlash("message")]);
  const unlocked = await isAdminUnlocked(user.id);

  if (!unlocked) {
    return (
      <main className="mx-auto max-w-sm px-5 py-16">
        <h1 className="text-2xl font-bold text-emerald-800">Admin panel</h1>
        <PageCard className="mt-6">
          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <form action={unlockAdminPanel} className="flex flex-col gap-3">
            <label className={labelClass}>
              Admin password
              <input name="password" type="password" required className={inputClass} />
            </label>
            <button type="submit" className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">
              Unlock
            </button>
          </form>
        </PageCard>
      </main>
    );
  }

  const restaurants = await prisma.restaurant.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      location: true,
      cuisineType: true,
      environment: true,
      archivedAt: true,
      memberships: {
        where: { active: true },
        select: { role: true, profile: { select: { email: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="text-2xl font-bold text-emerald-800">Admin panel</h1>
      <p className="mt-1 text-sm text-stone-600">
        Manage restaurant access and isolated test data. Every archive, restore,
        and Data Lab change is audited.
      </p>
      <Link href="/admin/data-lab" className="mt-4 inline-flex rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800">Open Operations Data Lab</Link>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}

      <PageCard className="mt-6">
        <h2 className="font-semibold">Create restaurant</h2>
        <p className="mt-1 text-xs text-stone-500">
          The owner email must already have a Halina account (they need to sign up first).
        </p>
        <form action={createRestaurantByAdmin} className="mt-4 flex flex-col gap-3">
          <label className={labelClass}>
            Name
            <input name="name" required maxLength={80} className={inputClass} />
          </label>
          <label className={labelClass}>
            Location
            <input name="location" maxLength={120} className={inputClass} />
          </label>
          <label className={labelClass}>
            Cuisine type <span className="font-normal text-stone-400">(optional)</span>
            <input name="cuisineType" maxLength={60} placeholder="e.g. Filipino Grill" className={inputClass} />
          </label>
          <label className={labelClass}>
            Owner email
            <input name="ownerEmail" type="email" required className={inputClass} />
          </label>
          <label className={labelClass}>
            Environment
            <select name="environment" className={`${inputClass} bg-white`}>
              <option value="LIVE">Live restaurant</option>
              <option value="TEST">Test restaurant (Data Lab only)</option>
            </select>
          </label>
          <button type="submit" className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">
            Create restaurant
          </button>
        </form>
      </PageCard>

      <PageCard className="mt-6">
        <h2 className="font-semibold">Assign manager</h2>
        <p className="mt-1 text-xs text-stone-500">The email must already have a Halina account.</p>
        <form action={assignManagerByAdmin} className="mt-4 flex flex-col gap-3">
          <label className={labelClass}>
            Restaurant
            <select name="restaurantId" required className={`${inputClass} bg-white`}>
              {restaurants.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.name} ({restaurant.slug})
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Email
            <input name="email" type="email" required className={inputClass} />
          </label>
          <label className={labelClass}>
            Role
            <select name="role" className={`${inputClass} bg-white`}>
              <option value="MANAGER">Manager</option>
              <option value="OWNER">Owner</option>
            </select>
          </label>
          <button type="submit" className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">
            Assign
          </button>
        </form>
      </PageCard>

      <PageCard className="mt-6">
        <h2 className="font-semibold">Existing restaurants</h2>
        <p className="mt-1 text-xs text-stone-500">Edit a restaurant&apos;s public details directly.</p>
        {restaurants.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">No restaurants yet.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {restaurants.map((restaurant) => (
              <li key={restaurant.id} className="rounded-lg border border-stone-200 p-4">
                <p className="text-xs text-stone-400">/{restaurant.slug} · {restaurant.environment}{restaurant.archivedAt ? " · ARCHIVED" : ""}</p>
                <form action={updateRestaurantByAdmin} className="mt-2 flex flex-col gap-3">
                  <input type="hidden" name="restaurantId" value={restaurant.id} />
                  <label className={labelClass}>
                    Name
                    <input
                      name="name"
                      required
                      maxLength={80}
                      defaultValue={restaurant.name}
                      className={inputClass}
                    />
                  </label>
                  <label className={labelClass}>
                    Location
                    <input
                      name="location"
                      maxLength={120}
                      defaultValue={restaurant.location}
                      className={inputClass}
                    />
                  </label>
                  <label className={labelClass}>
                    Cuisine type <span className="font-normal text-stone-400">(optional)</span>
                    <input
                      name="cuisineType"
                      maxLength={60}
                      defaultValue={restaurant.cuisineType ?? ""}
                      placeholder="e.g. Filipino Grill"
                      className={inputClass}
                    />
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      className="self-start rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white"
                    >
                      Save
                    </button>
                  </div>
                </form>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-sm text-stone-500">
                    {restaurant.memberships.length === 0
                      ? "No managers assigned"
                      : restaurant.memberships
                          .map((membership) => `${membership.profile.email} (${membership.role})`)
                          .join(", ")}
                  </div>
                  <ArchiveRestaurantButton
                    restaurantId={restaurant.id}
                    restaurantName={restaurant.name}
                    archived={Boolean(restaurant.archivedAt)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </PageCard>
    </main>
  );
}
