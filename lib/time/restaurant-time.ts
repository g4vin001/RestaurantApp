export const DEFAULT_RESTAURANT_TIMEZONE = "Asia/Manila";

export function restaurantTimeZone(timeZone?: string | null) {
  const candidate = timeZone?.trim() || DEFAULT_RESTAURANT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-PH", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return DEFAULT_RESTAURANT_TIMEZONE;
  }
}

export function formatRestaurantTime(
  value: Date | string,
  timeZone?: string | null,
) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: restaurantTimeZone(timeZone),
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatRestaurantDateTime(
  value: Date | string,
  timeZone?: string | null,
) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: restaurantTimeZone(timeZone),
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function restaurantDateParts(
  value: Date | string,
  timeZone?: string | null,
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: restaurantTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.map((part) => [part.type, part.value])) as Record<
    string,
    string
  >;
}

export function restaurantDateKey(
  value: Date | string,
  timeZone?: string | null,
) {
  const parts = restaurantDateParts(value, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function restaurantDateTimeInput(
  value: Date | string,
  timeZone?: string | null,
) {
  const parts = restaurantDateParts(value, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function offsetAt(value: Date, timeZone: string) {
  const parts = restaurantDateParts(value, timeZone);
  const representedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return representedAsUtc - Math.floor(value.getTime() / 1_000) * 1_000;
}

export function restaurantWallTimeToUtc(
  localValue: string,
  timeZone?: string | null,
) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localValue);
  if (!match) return null;
  const zone = restaurantTimeZone(timeZone);
  const wallClockUtc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
  let result = new Date(wallClockUtc);
  result = new Date(wallClockUtc - offsetAt(result, zone));
  result = new Date(wallClockUtc - offsetAt(result, zone));
  return Number.isNaN(result.getTime()) ? null : result;
}

export function startOfRestaurantDay(
  value: Date,
  timeZone?: string | null,
) {
  const parts = restaurantDateParts(value, timeZone);
  return restaurantWallTimeToUtc(
    `${parts.year}-${parts.month}-${parts.day}T00:00`,
    timeZone,
  ) as Date;
}

export function isTimestampStale(
  lastUpdatedAt: Date | string,
  now: Date,
  staleAfterMs: number,
) {
  const updatedAt = new Date(lastUpdatedAt).getTime();
  return !Number.isFinite(updatedAt) || now.getTime() - updatedAt > staleAfterMs;
}
