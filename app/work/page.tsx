import Link from "next/link";
import { redirect } from "next/navigation";
import { ClockInForm } from "./ClockInForm";
import { clockOut } from "./actions";
import {
  getCurrentWorkContext,
  getEligibleWorkplaces,
  isVerifiedHalinaUser,
  type EligibleWorkplace,
  type WorkContext,
} from "@/lib/staff/access";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const presetLabels = {
  MANAGER: "Operations lead",
  HOST: "Host",
  FLOOR_STAFF: "Floor staff",
} as const;

export default async function WorkPage() {
  if (process.env.NEXT_PUBLIC_HALINA_DEMO_MODE === "true") {
    return (
      <main className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="text-3xl font-bold text-stone-950">Work</h1>
        <p className="mt-3 text-stone-600">
          Staff clock-in is available in database mode only. Demo mode keeps staff access isolated from real accounts.
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/work");

  if (!isVerifiedHalinaUser(user)) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-12">
        <p className="text-sm font-semibold text-emerald-700">WORK</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-950">Verify your email first</h1>
        <p className="mt-3 max-w-xl text-stone-600">
          Restaurant work access is matched against the verified email on your normal Halina account. Confirm your account email, then return here.
        </p>
      </main>
    );
  }

  let workplaces: EligibleWorkplace[];
  let current: WorkContext | null;
  try {
    [workplaces, current] = await Promise.all([
      getEligibleWorkplaces(user),
      getCurrentWorkContext(user),
    ]);
  } catch (error) {
    console.error("[halina:work-access-load]", error);
    return (
      <main className="mx-auto max-w-3xl px-5 py-12">
        <p className="text-sm font-semibold text-emerald-700">WORK</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-950">Work access is being prepared</h1>
        <p className="mt-3 max-w-xl text-stone-600">
          Your personal Halina account is fine, but this environment is not ready for staff whitelist and PIN clock-in yet. Ask the restaurant manager to try again after the staff-work database migration is applied.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <p className="text-sm font-semibold text-emerald-700">WORK</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-950">
        Restaurant work access
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
        You are still signed in with your personal Halina account. A restaurant can only appear here when its manager has whitelisted this account&apos;s verified email.
      </p>

      {current ? (
        <section className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Clocked in</p>
              <h2 className="mt-1 text-xl font-bold text-stone-950">{current.restaurantName}</h2>
              <p className="mt-1 text-sm text-stone-600">
                {current.staffName} · {current.jobTitle} · {current.staffRoleName ?? presetLabels[current.permissionPreset]}
              </p>
              <p className="mt-2 text-xs leading-5 text-stone-500">
                This work-mode session expires automatically after a maximum of 16 hours. Closing the browser or losing battery does not normally end it.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/ops"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white"
              >
                Resume work
              </Link>
              <form action={clockOut}>
                <button className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700">
                  Clock out
                </button>
              </form>
            </div>
          </div>
        </section>
      ) : workplaces.length ? (
        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {workplaces.map((workplace) => (
            <section
              key={workplace.staffMemberId}
              className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-stone-400">Authorized workplace</p>
              <h2 className="mt-1 text-xl font-bold text-stone-950">{workplace.restaurantName}</h2>
              {workplace.restaurantLocation && (
                <p className="mt-1 text-sm text-stone-500">{workplace.restaurantLocation}</p>
              )}
              <div className="my-4 border-t border-stone-100" />
              <p className="text-sm font-semibold text-stone-800">{workplace.staffName}</p>
              <p className="mt-1 text-sm text-stone-500">
                {workplace.jobTitle} · {workplace.staffRoleName ?? presetLabels[workplace.permissionPreset]}
              </p>
              <div className="mt-5">
                <ClockInForm
                  restaurantId={workplace.restaurantId}
                  pinConfigured={workplace.pinConfigured}
                />
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="mt-7 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-stone-900">No restaurant work access</h2>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            No active restaurant staff record currently whitelists this account&apos;s verified email. If you work at a restaurant using Halina, ask its manager to add the exact email shown on your personal account.
          </p>
        </section>
      )}
    </main>
  );
}
