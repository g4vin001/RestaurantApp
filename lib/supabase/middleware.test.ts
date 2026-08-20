import { describe, expect, it } from "vitest";
import { isAnonymousBrowsePath } from "./middleware";

describe("isAnonymousBrowsePath", () => {
  it("allows the public restaurant discovery and detail pages without auth", () => {
    expect(isAnonymousBrowsePath("/")).toBe(true);
    expect(isAnonymousBrowsePath("/restaurants/sample-restaurant")).toBe(true);
  });

  it("does not make customer mutations or private workspaces anonymous", () => {
    expect(isAnonymousBrowsePath("/restaurants/sample-restaurant/book")).toBe(false);
    expect(isAnonymousBrowsePath("/restaurants/sample-restaurant/waitlist")).toBe(false);
    expect(isAnonymousBrowsePath("/manager")).toBe(false);
    expect(isAnonymousBrowsePath("/ops")).toBe(false);
    expect(isAnonymousBrowsePath("/my/waitlist")).toBe(false);
  });
});
