import { describe, expect, it } from "vitest";
import { validateReservationBooking } from "./reservation-booking";

const now = new Date("2026-08-10T00:00:00.000Z");

function bookingForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set("partyName", "Cruz family");
  form.set("partySize", "4");
  form.set("scheduledAt", "2026-08-15T19:30");
  form.set("contact", "0917 000 0000");
  form.set("notes", "Window seat if possible");
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

describe("validateReservationBooking", () => {
  it("normalizes valid input and converts Manila local time to UTC", () => {
    const result = validateReservationBooking(bookingForm(), now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.partyName).toBe("Cruz family");
    expect(result.input.partySize).toBe(4);
    // 19:30 Asia/Manila (UTC+8) on 2026-08-15 is 11:30 UTC.
    expect(result.input.scheduledAt.toISOString()).toBe("2026-08-15T11:30:00.000Z");
    expect(result.input.contact).toBe("0917 000 0000");
    expect(result.input.notes).toBe("Window seat if possible");
  });

  it("rejects an empty or oversized party name", () => {
    expect(validateReservationBooking(bookingForm({ partyName: "" }), now).ok).toBe(false);
    expect(
      validateReservationBooking(bookingForm({ partyName: "x".repeat(81) }), now).ok,
    ).toBe(false);
  });

  it("rejects a party size outside 1-30", () => {
    expect(validateReservationBooking(bookingForm({ partySize: "0" }), now).ok).toBe(false);
    expect(validateReservationBooking(bookingForm({ partySize: "31" }), now).ok).toBe(false);
    expect(validateReservationBooking(bookingForm({ partySize: "2.5" }), now).ok).toBe(false);
  });

  it("rejects an unparseable date/time", () => {
    expect(
      validateReservationBooking(bookingForm({ scheduledAt: "not-a-date" }), now).ok,
    ).toBe(false);
  });

  it("rejects a booking less than 30 minutes out", () => {
    const soon = new Date(now.getTime() + 10 * 60_000);
    const value = soon.toISOString().slice(0, 16);
    expect(validateReservationBooking(bookingForm({ scheduledAt: value }), now).ok).toBe(false);
  });

  it("rejects a booking more than 90 days out", () => {
    expect(
      validateReservationBooking(bookingForm({ scheduledAt: "2027-01-01T12:00" }), now).ok,
    ).toBe(false);
  });

  it("rejects oversized contact and notes", () => {
    expect(
      validateReservationBooking(bookingForm({ contact: "x".repeat(121) }), now).ok,
    ).toBe(false);
    expect(
      validateReservationBooking(bookingForm({ notes: "x".repeat(501) }), now).ok,
    ).toBe(false);
  });
});
