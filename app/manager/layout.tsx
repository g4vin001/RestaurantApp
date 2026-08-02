import { redirect } from "next/navigation";
import { ManagerShell } from "@/components/manager/ManagerShell";
import { getActiveManagerMembership } from "@/lib/auth/manager-membership";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const demoMode = process.env.NEXT_PUBLIC_HALINA_DEMO_MODE === "true";

  if (demoMode) {
    return (
      <div className="manager-app">
        <ManagerShell demoMode profileName="Demo manager">
          {children}
        </ManagerShell>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/manager");

  const [profile, membership] = await Promise.all([
    prisma.profile.findUnique({ where: { id: user.id } }),
    getActiveManagerMembership(user.id),
  ]);

  if (!profile || !membership) redirect("/onboarding/restaurant");

  return (
    <div className="manager-app">
      <ManagerShell demoMode={false} profileName={profile.displayName}>
        {children}
      </ManagerShell>
    </div>
  );
}
