import { describe, expect, it } from "vitest";
import { hashStaffPin, isValidStaffPin, verifyStaffPin } from "@/lib/staff/pin";

describe("staff clock-in PIN", () => {
  it.each(["0000", "4392", "9999"])("accepts four digits: %s", (pin) => {
    expect(isValidStaffPin(pin)).toBe(true);
  });

  it.each(["123", "12345", "12a4", " 4392", "4392 "])(
    "rejects malformed PIN: %s",
    (pin) => {
      expect(isValidStaffPin(pin)).toBe(false);
    },
  );

  it("uses a fresh salt and verifies without storing the PIN", () => {
    const first = hashStaffPin("4392");
    const second = hashStaffPin("4392");

    expect(first).not.toBe(second);
    expect(first).not.toContain("4392");
    expect(verifyStaffPin("4392", first)).toBe(true);
    expect(verifyStaffPin("1111", first)).toBe(false);
    expect(verifyStaffPin("4392", "not-a-valid-hash")).toBe(false);
  });
});
