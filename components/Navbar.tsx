import Link from "next/link";
import { AccountIdentity } from "@/components/ui/AccountIdentity";
import { logout } from "@/app/login/actions";
import { getCurrentAuthIdentity } from "@/lib/auth/current-identity";
import { getActiveManagerMembership } from "@/lib/auth/manager-membership";
import { hasEligibleWorkplace } from "@/lib/staff/access";

export async function Navbar() {
  if (process.env.NEXT_PUBLIC_HALINA_DEMO_MODE === "true") {
    return (
      <header className="border-b border-stone-200 bg-white">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"
        >
          <Link href="/" className="text-xl font-bold text-emerald-800">
            Halina
          </Link>
          <div className="flex items-center gap-4 text-sm text-stone-600">
            <Link href="/manager">Manager demo</Link>
            <Link href="/login" className="font-medium text-emerald-700">
              Log in
            </Link>
          </div>
        </nav>
      </header>
    );
  }

  const user = await getCurrentAuthIdentity();
  let showWork = false;
  let showManager = false;
  if (user) {
    const [work, manager] = await Promise.allSettled([
      hasEligibleWorkplace(user),
      getActiveManagerMembership(user.id),
    ]);
    showWork = work.status === "fulfilled" && work.value;
    showManager = manager.status === "fulfilled" && Boolean(manager.value);
    if (work.status === "rejected") console.error("[halina:navbar-work-access]", work.reason);
    if (manager.status === "rejected") console.error("[halina:navbar-manager-access]", manager.reason);
  }

  return (
    <header className="border-b border-stone-200 bg-white">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4"
      >
        <Link href="/" className="text-xl font-bold text-emerald-800">
          Halina
        </Link>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-stone-600">
          {user ? (
            <>
              <Link href="/reservations">My reservations</Link>
              {showManager ? <Link href="/manager">Manager</Link> : <Link href="/onboarding/restaurant">List a restaurant</Link>}
              {showManager && <Link href="/onboarding/restaurant">Restaurant application</Link>}
              {showWork && (
                <Link href="/work" className="font-medium text-emerald-700">
                  Work
                </Link>
              )}
              <AccountIdentity email={user.email} />
              <form action={logout}>
                <button type="submit" className="font-medium text-stone-700">
                  Log out
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className="font-medium text-emerald-700">
              Log in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
