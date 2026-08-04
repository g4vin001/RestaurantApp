import { describe, expect, it } from "vitest";
import {
  createRestaurantSlug,
  validateRestaurantSetup,
} from "./restaurant-onboarding";

function setupForm(name: string, location = "") {
  const form = new FormData();
  form.set("name", name);
  form.set("location", location);
  return form;
}

describe("restaurant onboarding", () => {
  it("normalizes valid restaurant details", () => {
    expect(
      validateRestaurantSetup(
        setupForm("  Salu-Salo   Kitchen  ", " Quezon   City "),
      ),
    ).toEqual({
      ok: true,
      input: {
        name: "Salu-Salo Kitchen",
        location: "Quezon City",
      },
    });
  });

  it("rejects invalid names and oversized locations", () => {
    expect(validateRestaurantSetup(setupForm("A")).ok).toBe(false);
    expect(validateRestaurantSetup(setupForm("Valid", "x".repeat(121))).ok).toBe(
      false,
    );
  });

  it("creates a stable, URL-safe slug with a uniqueness suffix", () => {
    expect(createRestaurantSlug("Kusina ni Lóla!", "A1B2C3D4")).toBe(
      "kusina-ni-lola-a1b2c3d4",
    );
  });
});
