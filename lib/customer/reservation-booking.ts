export type ReservationBookingInput = {
  partyName: string;
  partySize: number;
  scheduledAt: Date;
  contact?: string;
  notes?: string;
};

type ValidationResult =
  | { ok: true; input: ReservationBookingInput }
  | { ok: false; error: string };

const MIN_LEAD_MS = 30 * 60_000;
const MAX_LEAD_MS = 90 * 24 * 60 * 60_000;
// Nothing in this codebase does real per-restaurant timezone math yet
// (lib/domain/analytics.ts hardcodes the same assumption) — treat every
// datetime-local value as Asia/Manila local time (UTC+8).
const MANILA_OFFSET_MS = 8 * 60 * 60_000;

function formText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function parseManilaDateTimeLocal(value: string): Date | null {
  if (!value) return null;
  const asUtc = Date.parse(`${value}Z`);
  if (Number.isNaN(asUtc)) return null;
  return new Date(asUtc - MANILA_OFFSET_MS);
}

export function validateReservationBooking(
  formData: FormData,
  now = new Date(),
): ValidationResult {
  const partyName = formText(formData.get("partyName"));
  const partySizeRaw = formText(formData.get("partySize"));
  const scheduledAtRaw = formText(formData.get("scheduledAt"));
  const contact = formText(formData.get("contact"));
  const notes = formText(formData.get("notes"));

  if (partyName.length < 1 || partyName.length > 80) {
    return { ok: false, error: "Party name must be between 1 and 80 characters." };
  }

  const partySize = Number(partySizeRaw);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 30) {
    return { ok: false, error: "Party size must be between 1 and 30." };
  }

  const scheduledAt = parseManilaDateTimeLocal(scheduledAtRaw);
  if (!scheduledAt) {
    return { ok: false, error: "Choose a valid reservation date and time." };
  }
  if (scheduledAt.getTime() < now.getTime() + MIN_LEAD_MS) {
    return { ok: false, error: "Reservations need at least 30 minutes' notice." };
  }
  if (scheduledAt.getTime() > now.getTime() + MAX_LEAD_MS) {
    return { ok: false, error: "Reservations can only be made up to 90 days ahead." };
  }

  if (contact.length > 120) {
    return { ok: false, error: "Contact must be 120 characters or fewer." };
  }
  if (notes.length > 500) {
    return { ok: false, error: "Notes must be 500 characters or fewer." };
  }

  return {
    ok: true,
    input: {
      partyName,
      partySize,
      scheduledAt,
      contact: contact || undefined,
      notes: notes || undefined,
    },
  };
}
