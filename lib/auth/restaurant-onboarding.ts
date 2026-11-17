export type RestaurantSetupInput = {
  name: string;
  location: string;
};

type ValidationResult =
  | { ok: true; input: RestaurantSetupInput }
  | { ok: false; error: string };

function formText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function validateRestaurantSetup(formData: FormData): ValidationResult {
  const name = formText(formData.get("name"));
  const location = formText(formData.get("location"));

  if (name.length < 2 || name.length > 80) {
    return {
      ok: false,
      error: "Restaurant name must be between 2 and 80 characters.",
    };
  }

  if (location.length > 120) {
    return {
      ok: false,
      error: "Location must be 120 characters or fewer.",
    };
  }

  return { ok: true, input: { name, location } };
}

export function createRestaurantSlug(name: string, suffix: string) {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54);

  return `${base || "restaurant"}-${suffix.toLowerCase()}`;
}

export function validateRestaurantApplication(formData: FormData) {
  const restaurant = validateRestaurantSetup(formData);
  if (!restaurant.ok) return restaurant;
  const mapsUrl = formText(formData.get("mapsUrl"));
  const url = URL.canParse(mapsUrl) ? new URL(mapsUrl) : null;
  const isMapsLink = url && (
    (["www.google.com", "google.com", "goo.gl"].includes(url.hostname) && /^\/maps(?:\/|$)/.test(url.pathname)) ||
    (url.hostname === "maps.app.goo.gl" && url.pathname.length > 1) ||
    (url.hostname === "maps.google.com" && (url.search.length > 1 || url.pathname.length > 1))
  );
  if (!restaurant.input.location) return { ok: false as const, error: "Enter the restaurant's address or city." };
  if (!isMapsLink || url.protocol !== "https:" || url.username || url.password || url.port || mapsUrl.length > 2_000) {
    return { ok: false as const, error: "Enter an HTTPS Google Maps link for the restaurant." };
  }
  return { ok: true as const, input: { ...restaurant.input, mapsUrl: url.href } };
}
