import Link from "next/link";
import { CircleUserRound } from "lucide-react";
import { logout } from "@/app/login/actions";
import { getCurrentAuthIdentity } from "@/lib/auth/current-identity";
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
  if (user) {
    try {
      showWork = await hasEligibleWorkplace(user);
    } catch (error) {
      // Keep the global navigation usable during a database outage or while an
      // additive staff migration is still rolling out.
      console.error("[halina:navbar-work-access]", error);
    }
  }

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
          <Link href="/manager">Manager</Link>
          {user ? (
            <>
              <Link href="/reservations">My reservations</Link>
              {showWork && (
                <Link href="/work" className="font-medium text-emerald-700">
                  Work
                </Link>
              )}
              <span
                className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-stone-700"
                title={user.email ? `Signed in as ${user.email}` : "Signed in"}
              >
                <CircleUserRound size={16} className="shrink-0" aria-hidden />
                {/* Phones show only the icon; the email lives in the title and screen-reader text. */}
                <span className="sr-only">Signed in as </span>
                <span className="sr-only sm:not-sr-only sm:max-w-56 sm:truncate">
                  {user.email ?? "Signed in"}
                </span>
              </span>
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
