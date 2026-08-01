"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";
import {
  BarChart3,
  CircleUserRound,
  LayoutDashboard,
  MapPinned,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Rows3,
  Settings,
  UsersRound,
  RotateCcw,
  Utensils,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useDemo } from "@/components/demo/DemoProvider";
import { formatLastUpdated } from "@/lib/helpers";

const navigation = [
  { href: "/manager", label: "Overview", icon: LayoutDashboard },
  { href: "/manager/floor", label: "Live floor", icon: Utensils },
  { href: "/manager/layout", label: "Floor plans", icon: MapPinned },
  { href: "/manager/queue", label: "Queue & reservations", icon: Rows3 },
  { href: "/manager/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/manager/team", label: "Team", icon: UsersRound },
  { href: "/manager/settings", label: "Restaurant settings", icon: Settings },
];

function ShellContent({
  children,
  demoMode,
  profileName,
}: {
  children: ReactNode;
  demoMode: boolean;
  profileName: string;
}) {
  const pathname = usePathname();
  const { state, reset } = useDemo();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const sidebar = (
    <>
      <div className="flex h-18 items-center justify-between border-b border-white/10 px-4">
        <Link
          href="/manager"
          className="flex items-center gap-3"
          onClick={() => setMobileOpen(false)}
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-400 text-sm font-black text-emerald-950">
            H
          </span>
          {!collapsed && (
            <span className="text-lg font-bold tracking-tight text-white">
              Halina
            </span>
          )}
        </Link>
        <button
          type="button"
          className="hidden rounded-lg p-2 text-emerald-100 hover:bg-white/10 hover:text-white lg:inline-flex"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen size={19} />
          ) : (
            <PanelLeftClose size={19} />
          )}
        </button>
        <button
          type="button"
          className="rounded-lg p-2 text-white lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
      </div>

      <div className="border-b border-white/10 p-3">
        <div
          className="flex w-full items-center gap-3 rounded-xl bg-white/8 p-3 text-left"
          aria-label="Current restaurant"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-300/15 text-amber-200">
            <Utensils size={18} />
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white">
                {state.restaurant.name}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-emerald-200">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${state.restaurant.isOpen ? "bg-emerald-400" : "bg-stone-400"}`}
                />
                {state.restaurant.isOpen
                  ? "Accepting walk-ins"
                  : "Walk-ins paused"}
              </span>
            </span>
          )}
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3" aria-label="Manager navigation">
        {navigation.map((item) => {
          const active =
            item.href === "/manager"
              ? pathname === item.href
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "bg-white text-emerald-950 shadow-sm" : "text-emerald-100 hover:bg-white/10 hover:text-white"}`}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={19} className="shrink-0" />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        {!collapsed && (
          <div className="mb-3 rounded-xl border border-amber-200/20 bg-amber-200/10 p-3 text-xs text-amber-50">
            <p className="font-semibold">
              {demoMode ? "Demo mode" : "Prototype data"}
            </p>
            <p className="mt-1 leading-5 text-amber-100/80">
              Changes stay in this browser and sync across open tabs.
            </p>
            <button
              type="button"
              onClick={() => setResetOpen(true)}
              className="mt-2 inline-flex items-center gap-1.5 font-semibold text-amber-100 hover:text-white"
            >
              <RotateCcw size={14} /> Reset demo data
            </button>
          </div>
        )}
        <div className="flex items-center gap-3 rounded-xl px-2 py-2 text-emerald-100">
          <CircleUserRound size={24} className="shrink-0" />
          {!collapsed && (
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {profileName}
            </span>
          )}
          {!collapsed && !demoMode && (
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg p-1.5 hover:bg-white/10 hover:text-white"
                aria-label="Log out"
              >
                <LogOut size={17} />
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-stone-100/80">
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col bg-emerald-950 transition-all duration-200 lg:flex ${collapsed ? "w-20" : "w-64"}`}
      >
        {sidebar}
      </aside>
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-stone-950/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation overlay"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-emerald-950 transition-transform lg:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {sidebar}
      </aside>

      <div
        className={`transition-[padding] duration-200 ${collapsed ? "lg:pl-20" : "lg:pl-64"}`}
      >
        <header className="sticky top-0 z-30 flex h-18 items-center justify-between border-b border-stone-200 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button
            type="button"
            className="rounded-lg border border-stone-200 p-2.5 text-stone-700 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <div className="hidden items-center gap-2 text-sm text-stone-500 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Updated {formatLastUpdated(state.lastUpdatedAt)}
          </div>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
            {demoMode ? "Demo data" : "Prototype data"}
          </span>
        </header>
        <main>{children}</main>
      </div>
      {resetOpen && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-stone-950/50 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setResetOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-700">
              <RotateCcw size={20} />
            </span>
            <h2
              id="reset-title"
              className="mt-4 text-xl font-bold text-stone-950"
            >
              Reset demo data?
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              This restores the original tables, queue, sessions, and events in
              this browser. Your changes cannot be recovered.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setResetOpen(false)}
                className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-semibold text-stone-700 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  reset();
                  setResetOpen(false);
                }}
                className="min-h-11 rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800"
              >
                Reset data
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export function ManagerShell(props: {
  children: ReactNode;
  demoMode: boolean;
  profileName: string;
}) {
  return <ShellContent {...props} />;
}
