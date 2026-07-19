import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Halina | Restaurant wait times",
  description: "A prototype for live restaurant wait-time updates.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Navbar />{children}</body></html>;
}
