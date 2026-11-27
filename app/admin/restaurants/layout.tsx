import Link from "next/link";
import type { ReactNode } from "react";

export default function RestaurantAdminLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:py-12">
      <nav aria-label="Administration" className="mb-6 flex flex-wrap gap-x-6 gap-y-2 border-b border-stone-200 pb-4 text-sm font-semibold text-emerald-900">
        <Link href="/admin">Platform administration</Link>
        <Link href="/admin/restaurants">Applications</Link>
        <Link href="/admin/restaurants?view=listings">Restaurant listings</Link>
      </nav>
      {children}
    </main>
  );
}
