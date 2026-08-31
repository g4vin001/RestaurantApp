import { redirect } from "next/navigation";
import { DatabaseUnavailable } from "@/components/DatabaseUnavailable";
import { OperationsProvider } from "@/components/demo/DemoProvider";
import { ManagerShell } from "@/components/manager/ManagerShell";
import { getActiveManagerMembership } from "@/lib/auth/manager-membership";
import type { OperationsState } from "@/lib/domain/types";
import { prisma } from "@/lib/prisma";
import { DemoOperationsRepository } from "@/lib/repositories/demo/demo-operations";
import {
  OperationsRepositoryError,
  resolveOperationsRepositoryMode,
} from "@/lib/repositories/operations";
import { PrismaOperationsRepository } from "@/lib/repositories/prisma/prisma-operations";
import { reportDataError } from "@/lib/server/data-error";
import { createClient } from "@/lib/supabase/server";

export default async function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const repositoryMode = resolveOperationsRepositoryMode(
    process.env.NEXT_PUBLIC_HALINA_DEMO_MODE,
  );

  if (repositoryMode === "demo") {
    const repository = new DemoOperationsRepository();
    const initialState = await repository.loadSnapshot();
    return (
      <OperationsProvider
        repositoryMode={repository.mode}
        initialState={initialState}
      >
        <div className="manager-app">
          <ManagerShell demoMode profileName="Demo manager">
            {children}
          </ManagerShell>
        </div>
      </OperationsProvider>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/manager");

  let profile: { displayName: string } | null;
  let membership: Awaited<ReturnType<typeof getActiveManagerMembership>>;
  try {
    [profile, membership] = await Promise.all([
      prisma.profile.findUnique({
        where: { id: user.id },
        select: { displayName: true },
      }),
      getActiveManagerMembership(user.id),
    ]);
  } catch (error) {
    const reference = reportDataError("manager-context", error);
    return <DatabaseUnavailable reference={reference} />;
  }

  if (!profile || !membership) redirect("/onboarding/restaurant");

  const repository = new PrismaOperationsRepository(prisma, {
    profileId: user.id,
    restaurantId: membership.restaurantId,
    membershipId: membership.id,
    membershipRole: membership.role,
  });

  let initialState: OperationsState;
  try {
    initialState = await repository.loadSnapshot();
  } catch (error) {
    if (
      error instanceof OperationsRepositoryError &&
      error.code === "FORBIDDEN"
    ) {
      redirect("/onboarding/restaurant");
    }
    const reference = reportDataError("manager-snapshot", error);
    return <DatabaseUnavailable reference={reference} />;
  }

  return (
    <OperationsProvider
      repositoryMode={repository.mode}
      initialState={initialState}
    >
      <div className="manager-app">
        <ManagerShell demoMode={false} profileName={profile.displayName}>
          {children}
        </ManagerShell>
      </div>
    </OperationsProvider>
  );
}
