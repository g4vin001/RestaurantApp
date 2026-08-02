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
