import { redirect } from "next/navigation";
import { PageCard } from "@/components/PageCard";
import { createClient } from "@/lib/supabase/server";
import { updatePassword } from "./actions";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="text-2xl font-bold text-emerald-800">Set a new password</h1>
      <p className="mt-1 text-sm text-stone-600">
        Choose a new password for your Halina account.
      </p>
      <PageCard className="mt-6">
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
