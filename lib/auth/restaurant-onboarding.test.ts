import { describe, expect, it } from "vitest";
import {
  createRestaurantSlug,
  readApplicationEvidence,
  validateRestaurantApplication,
} from "./restaurant-onboarding";

function applicationForm() {
  const form = new FormData();
  form.set("name", "  Salu-Salo   Kitchen  ");
  form.set("address", "  31   Tomas Morato Avenue, Quezon City  ");
  form.set("mapsUrl", "https://www.google.com/maps/place/Salu-Salo?utm_source=share");
  form.set("phone", "+63 912 345 6789");
  form.set("businessEmail", "CONTACT@example.com");
  form.set("applicantName", "Maria Santos");
  form.set("relationship", "AUTHORIZED_REPRESENTATIVE");
  return form;
}

describe("restaurant onboarding", () => {
  it("normalizes valid restaurant details", () => {
    expect(validateRestaurantApplication(applicationForm())).toMatchObject({
      name: "Salu-Salo Kitchen",
      address: "31 Tomas Morato Avenue, Quezon City",
      mapsUrl: "https://www.google.com/maps/place/Salu-Salo",
      businessEmail: "contact@example.com",
    });
  });

  it.each([
    ["name", "A"], ["address", "Makati"], ["address", "x".repeat(301)], ["phone", "912ABC"],
    ["relationship", "ADMIN"], ["businessEmail", "not an email"],
    ["mapsUrl", "https://www.google.com.evil.example/maps"],
    ["mapsUrl", "https://google.com@other.example/maps"], ["mapsUrl", "https://google.com/search"],
    ["mapsUrl", "https://www.google.com/maps/"],
    ["website", "javascript:alert(1)"],
  ])("rejects invalid %s", (field, value) => {
    const form = applicationForm();
    form.set(field, value);
    expect(() => validateRestaurantApplication(form)).toThrow();
  });

  it("validates file type, size and bytes, and requires evidence on submission", async () => {
    await expect(readApplicationEvidence(null, true)).rejects.toThrow("Attach proof");
    await expect(readApplicationEvidence(new File([], ""), false)).resolves.toBeNull();
    await expect(readApplicationEvidence(new File(["<svg/>"], "proof.pdf", { type: "application/pdf" }), true)).rejects.toThrow("contents");
    await expect(readApplicationEvidence(new File([new Uint8Array(2097153)], "big.pdf", { type: "application/pdf" }), true)).rejects.toThrow("2 MB");
    await expect(readApplicationEvidence(new File(["%PDF-1.7\n"], "proof.pdf", { type: "application/pdf" }), true)).resolves.toMatchObject({
      filename: "proof.pdf", contentType: "application/pdf",
    });
  });

  it("creates a stable, URL-safe slug with a uniqueness suffix", () => {
    expect(createRestaurantSlug("Kusina ni Lóla!", "A1B2C3D4")).toBe(
      "kusina-ni-lola-a1b2c3d4",
    );
  });
});
