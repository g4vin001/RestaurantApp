import { redirect } from "next/navigation";
import { DatabaseUnavailable } from "@/components/DatabaseUnavailable";
import { OperationsProvider } from "@/components/demo/DemoProvider";
import { ManagerShell } from "@/components/manager/ManagerShell";
import { getCurrentAuthIdentity } from "@/lib/auth/current-identity";
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

  const user = await getCurrentAuthIdentity();

  if (!user) redirect("/login?redirectTo=/manager");

  let membership: Awaited<ReturnType<typeof getActiveManagerMembership>>;
  try {
    membership = await getActiveManagerMembership(user.id);
  } catch (error) {
    const reference = reportDataError("manager-context", error);
    return <DatabaseUnavailable reference={reference} />;
  }

  if (!membership) redirect("/onboarding/restaurant");

  const repository = new PrismaOperationsRepository(prisma, {
    profileId: user.id,
    restaurantId: membership.restaurantId,
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
        <ManagerShell
          demoMode={false}
          profileName={membership.profile.displayName}
        >
          {children}
        </ManagerShell>
      </div>
    </OperationsProvider>
  );
}
