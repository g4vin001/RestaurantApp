import type { ReactNode } from "react";

export function PageCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>{children}</section>;
}
