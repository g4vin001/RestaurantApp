import { redirect } from "next/navigation";
import { PageCard } from "@/components/PageCard";
import { ClearFlash } from "@/components/ui/ClearFlash";
import { readFlash } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";
import { updatePassword } from "./actions";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Reached only through the emailed link, which signs the user in briefly.
  // Without that session the link expired or was already used.
  if (!user) redirect("/forgot-password?expired=1");

  const error = await readFlash("error");

  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="text-2xl font-bold text-emerald-800">Set a new password</h1>
      <p className="mt-1 text-sm text-stone-600">
        Choose a new password for {user.email ?? "your Halina account"}. You&apos;ll log in with it next.
      </p>
      <PageCard className="mt-6">
        <ClearFlash />
        {error &&<p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <form action={updatePassword} className="space-y-3">
          <label className="block text-sm font-medium text-stone-700">
            New password
            <input
              name="password"
              type="password"
              required
              minLength={6}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            Confirm new password
            <input
              name="confirmPassword"
              type="password"
              required
              minLength={6}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white"
          >
            Update password
          </button>
        </form>
      </PageCard>
    </main>
  );
}
