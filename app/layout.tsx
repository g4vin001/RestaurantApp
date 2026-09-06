import type { Metadata } from "next";
import { Suspense } from "react";
import { Navbar } from "@/components/Navbar";
import { InteractionFeedback } from "@/components/ui/InteractionFeedback";
import "./globals.css";

export const metadata: Metadata = {
  title: "Halina | Restaurant wait times",
  description: "A prototype for live restaurant wait-time updates.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={null}>
          <InteractionFeedback />
        </Suspense>
        <Suspense
          fallback={
            <header className="border-b border-stone-200 bg-white">
              <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
                <span className="text-xl font-bold text-emerald-800">Halina</span>
                <span className="text-sm text-stone-400">Loading account…</span>
              </nav>
            </header>
          }
        >
          <Navbar />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
