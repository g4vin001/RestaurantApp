import { CircleUserRound } from "lucide-react";

export function AccountIdentity({ email }: { email?: string | null }) {
  return (
    <details className="relative text-sm text-stone-700">
      <summary
        aria-label={email ? "Show signed-in account " + email : "Show signed-in account"}
        className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-2.5 [&::-webkit-details-marker]:hidden"
      >
        <CircleUserRound size={16} aria-hidden />
        <span className="hidden max-w-44 truncate sm:inline">{email ?? "Account"}</span>
      </summary>
      <p className="absolute right-0 z-50 mt-2 w-max max-w-56 break-all rounded-lg border border-stone-200 bg-white p-3 shadow-lg">
        {email ? "Signed in as " + email : "Signed in"}
      </p>
    </details>
  );
}
