import Link from "next/link";
import { TeamManager } from "@/components/manager/TeamManager";

export default function TeamPage() {
  return (
    <>
      <div className="mx-auto max-w-[1400px] px-4 pt-6 sm:px-6 lg:px-8">
        <Link
          href="/manager/team/invite"
          className="inline-flex min-h-10 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
        >
          Invite staff access
        </Link>
      </div>
      <TeamManager />
    </>
  );
}
