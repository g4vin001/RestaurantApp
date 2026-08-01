import { describe, expect, it } from "vitest";
import { safeInternalRedirect } from "@/lib/auth/safe-redirect";

describe("safeInternalRedirect", () => {
  it("accepts an internal path", () => {
    expect(safeInternalRedirect("/manager/floor?table=1", "/")).toBe("/manager/floor?table=1");
  });

  it.each(["https://evil.test", "//evil.test", "/%2f%2fevil.test", "javascript:alert(1)"])(
    "rejects unsafe destination %s",
    (value) => {
      expect(safeInternalRedirect(value, "/")).toBe("/");
    },
  );
});
