"use client";

import { setRestaurantArchivedByAdmin } from "./actions";

export function ArchiveRestaurantButton({
  restaurantId,
  restaurantName,
  archived,
}: {
  restaurantId: string;
  restaurantName: string;
  archived: boolean;
}) {
  return (
    <form
      action={setRestaurantArchivedByAdmin}
      className="w-full rounded-lg border border-stone-200 bg-stone-50 p-3"
    >
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <input type="hidden" name="archived" value={archived ? "false" : "true"} />
      <label className="block text-xs font-medium text-stone-600">Type <strong>{restaurantName}</strong> to confirm<input name="confirmation" required className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5" /></label>
      <label className="mt-2 block text-xs font-medium text-stone-600">Audit reason<input name="reason" required minLength={4} maxLength={500} className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5" /></label>
      <button
        type="submit"
        className={`mt-3 rounded-lg border px-3 py-2 text-sm font-semibold ${archived ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50" : "border-amber-300 text-amber-800 hover:bg-amber-50"}`}
      >
        {archived ? "Restore restaurant" : "Archive restaurant"}
      </button>
    </form>
  );
}
