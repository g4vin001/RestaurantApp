import { redirect, notFound } from "next/navigation";
import { PageCard } from "@/components/PageCard";
import { ensureProfile } from "@/lib/auth/profile";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { WaitlistJoinForm } from "./WaitlistJoinForm";

export default async function WaitlistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(`/restaurants/${slug}/waitlist`)}`);
  const profile = await ensureProfile(user);
  const restaurant = await prisma.restaurant.findFirst({ where: { slug, environment: "LIVE", archivedAt: null }, select: { id: true, name: true, walkInAvailability: true } });
  if (!restaurant) notFound();

  const existing = await prisma.queueEntry.findFirst({
    where: { restaurantId: restaurant.id, createdById: profile.id, source: "CUSTOMER", status: { in: ["WAITING", "CALLED"] } },
    select: { id: true },
  });
  if (existing) redirect("/my/waitlist");

  return (
    <main className="mx-auto max-w-lg px-5 py-14">
      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Walk-in waitlist</p>
      <h1 className="mt-2 text-3xl font-bold">{restaurant.name}</h1>
      <p className="mt-2 text-sm text-stone-600">Join remotely, then keep this page/account available for status updates. This first version requires a Halina account.</p>
      <PageCard className="mt-6"><WaitlistJoinForm slug={slug} defaultPartyName={profile.displayName} /></PageCard>
    </main>
  );
}
