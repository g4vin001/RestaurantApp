"use client";

import { deleteRestaurantByAdmin } from "./actions";

export function DeleteRestaurantButton({
  restaurantId,
  restaurantName,
}: {
  restaurantId: string;
  restaurantName: string;
}) {
  return (
    <form
      action={deleteRestaurantByAdmin}
      onSubmit={(event) => {
        if (!confirm(`Delete "${restaurantName}"? This permanently removes all its floor plans, tables, queue entries, and reservations.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <button
        type="submit"
        className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
      >
        Delete restaurant
      </button>
    </form>
  );
}
