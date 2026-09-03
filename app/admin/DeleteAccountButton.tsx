"use client";

import { deleteAccountByAdmin } from "./actions";

export function DeleteAccountButton({
  profileId,
  email,
}: {
  profileId: string;
  email: string;
}) {
  return (
    <form
      action={deleteAccountByAdmin}
      className="w-full rounded-lg border border-stone-200 bg-stone-50 p-3"
    >
      <input type="hidden" name="profileId" value={profileId} />
      <label className="block text-xs font-medium text-stone-600">
        Type <strong>{email}</strong> to confirm
        <input name="confirmation" required className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5" />
      </label>
      <label className="mt-2 block text-xs font-medium text-stone-600">
        Audit reason
        <input name="reason" required minLength={4} maxLength={500} className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5" />
      </label>
      <button
        type="submit"
        className="mt-3 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
      >
        Delete account permanently
      </button>
    </form>
  );
}
