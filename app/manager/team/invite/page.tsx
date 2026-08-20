import Link from "next/link";
import { PageCard } from "@/components/PageCard";
import { InviteStaffForm } from "./InviteStaffForm";

export default function InviteStaffPage() {
  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <Link href="/manager/team" className="text-sm font-semibold text-emerald-700">← Team</Link>
      <h1 className="mt-3 text-3xl font-bold text-stone-950">Invite staff</h1>
      <p className="mt-2 text-sm leading-6 text-stone-600">Create a temporary access code for a host or floor staff member. They sign in with a normal Halina account, redeem the invite, then receive restricted operations access.</p>
      <PageCard className="mt-6"><InviteStaffForm /></PageCard>
    </main>
  );
}
