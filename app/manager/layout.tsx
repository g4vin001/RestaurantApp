import { redirect } from "next/navigation";
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
import { createClient } from "@/lib/supabase/server";

function OperationsLoadFailure() {
  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 p-6">
      <section className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-rose-700">SHARED DATA ERROR</p>
        <h1 className="mt-2 text-2xl font-bold text-stone-950">
          Restaurant data could not be loaded
        </h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Your account is signed in, but Halina could not read the restaurant
          database. No browser demo data was substituted. Please retry after
          checking the database connection and migration status.
        </p>
      </section>
    </main>
  );
}

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

  const [profile, membership] = await Promise.all([
    prisma.profile.findUnique({ where: { id: user.id } }),
    getActiveManagerMembership(user.id),
  ]);

  if (!profile || !membership) redirect("/onboarding/restaurant");

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
    return <OperationsLoadFailure />;
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
