import {
  formatRestaurantDateTime,
  formatRestaurantTime,
  restaurantDateKey,
  restaurantWallTimeToUtc,
} from "@/lib/time/restaurant-time";

export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type ServicePeriod = { opensAt: string; closesAt: string };
export type ScheduleException = { date: string; label: string; periods: ServicePeriod[] };
export type OperatingSchedule = {
  weekly: Record<Weekday, ServicePeriod[]>;
  exceptions: ScheduleException[];
};
type ScheduleSource = { schedule?: unknown; opensAtHour?: unknown; closesAtHour?: unknown; timezone?: string | null };
export type ServiceInterval = { start: Date; end: Date };
const DAY_MS = 86_400_000;

export function weekdayLabel(day: Weekday) {
  return day[0].toUpperCase() + day.slice(1);
}

function clockMinutes(value: unknown) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function periodMinutes(period: ServicePeriod) {
  const start = clockMinutes(period.opensAt) as number;
  const close = clockMinutes(period.closesAt) as number;
  // Closing at or before opening means the following day; equal times mean 24 hours.
  return { start, end: close <= start ? close + 1440 : close };
}

export function shiftScheduleDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 1000 || year > 9998) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function legacyOperatingSchedule(opensAtHour = 10, closesAtHour = 22): OperatingSchedule {
  const clock = (hour: number) => `${String(hour % 24).padStart(2, "0")}:00`;
  return {
    weekly: Object.fromEntries(WEEKDAYS.map((day) => [day, [{ opensAt: clock(opensAtHour), closesAt: clock(closesAtHour) }]])) as OperatingSchedule["weekly"],
    exceptions: [],
  };
}

export function periodsForDate(schedule: OperatingSchedule, date: string) {
  const exception = schedule.exceptions.find((item) => item.date === date);
  if (exception) return exception.periods;
  const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  return schedule.weekly[WEEKDAYS[weekday]];
}

function hasOverlap(intervals: { start: number; end: number }[]) {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  return sorted.some((item, index) => index > 0 && item.start < sorted[index - 1].end);
}

export function validateOperatingSchedule(value: unknown):
  | { ok: true; schedule: OperatingSchedule }
  | { ok: false; error: string } {
  const source = record(value);
  const weekly = record(source?.weekly);
  if (!weekly || !Array.isArray(source?.exceptions) || source.exceptions.length > 100) {
    return { ok: false, error: "Provide all seven weekdays and no more than 100 special dates." };
  }
  function parsePeriods(value: unknown): ServicePeriod[] | null {
    if (!Array.isArray(value) || value.length > 4) return null;
    const result: ServicePeriod[] = [];
    for (const item of value) {
      const period = record(item);
      if (clockMinutes(period?.opensAt) === null || clockMinutes(period?.closesAt) === null) return null;
      result.push({ opensAt: period!.opensAt as string, closesAt: period!.closesAt as string });
    }
    return result.sort((a, b) => a.opensAt.localeCompare(b.opensAt));
  }
  const normalized: OperatingSchedule = { weekly: {} as OperatingSchedule["weekly"], exceptions: [] };
  for (const day of WEEKDAYS) {
    const periods = parsePeriods(weekly[day]);
    if (!periods) return { ok: false, error: `${weekdayLabel(day)} needs valid opening and closing times, with at most four service periods.` };
    normalized.weekly[day] = periods;
  }
  // Include Sunday/Monday across the boundary to catch overnight weekly overlap.
  const weekIntervals = Array.from({ length: 9 }, (_, index) => index - 1).flatMap((index) =>
    normalized.weekly[WEEKDAYS[(index + 7) % 7]].map((period) => {
      const { start, end } = periodMinutes(period);
      return { start: index * 1440 + start, end: index * 1440 + end };
    }),
  );
  if (hasOverlap(weekIntervals)) return { ok: false, error: "Weekly service periods overlap. Check split shifts and closing times that continue into the next day." };
  const dates = new Set<string>();
  for (const item of source.exceptions) {
    const exception = record(item);
    const periods = parsePeriods(exception?.periods);
    if (!validDate(exception?.date) || !periods || typeof exception.label !== "string" || exception.label.length > 80) {
      return { ok: false, error: "Each special date needs a real calendar date, valid service times, and a label of at most 80 characters." };
    }
    if (dates.has(exception.date)) return { ok: false, error: "Only one exception is allowed per date." };
    dates.add(exception.date);
    normalized.exceptions.push({ date: exception.date, label: exception.label.trim(), periods });
  }
  normalized.exceptions.sort((a, b) => a.date.localeCompare(b.date));
  for (const exception of normalized.exceptions) {
    const intervals = [0, 1].flatMap((offset) => {
      const date = shiftScheduleDate(exception.date, offset);
      const nextIsException = dates.has(shiftScheduleDate(date, 1));
      return periodsForDate(normalized, date).map((period) => {
        const { start, end } = periodMinutes(period);
        return { start: offset * 1440 + start, end: offset * 1440 + (nextIsException ? Math.min(end, 1440) : end) };
      });
    });
    if (hasOverlap(intervals)) return { ok: false, error: `Service periods overlap on or after ${exception.date}. Check the following day's opening time.` };
  }
  return { ok: true, schedule: normalized };
}

export function readOperatingSchedule(source: ScheduleSource): OperatingSchedule {
  if (source.schedule !== undefined && source.schedule !== null) {
    const parsed = validateOperatingSchedule(source.schedule);
    if (parsed.ok) return parsed.schedule;
    // Invalid stored schedules must not advertise service or accept bookings.
    return { weekly: Object.fromEntries(WEEKDAYS.map((day) => [day, [] as ServicePeriod[]])) as OperatingSchedule["weekly"], exceptions: [] };
  }
  const open = typeof source.opensAtHour === "number" && Number.isInteger(source.opensAtHour) && source.opensAtHour >= 0 && source.opensAtHour <= 23 ? source.opensAtHour : 10;
  const close = typeof source.closesAtHour === "number" && Number.isInteger(source.closesAtHour) && source.closesAtHour >= 1 && source.closesAtHour <= 24 ? source.closesAtHour : 22;
  return legacyOperatingSchedule(open, close);
}

function intervalsStartingOn(schedule: OperatingSchedule, date: string, timeZone?: string | null): ServiceInterval[] {
  const nextDate = shiftScheduleDate(date, 1);
  const nextIsException = schedule.exceptions.some((item) => item.date === nextDate);
  return periodsForDate(schedule, date).flatMap((period) => {
    const { end: endMinute } = periodMinutes(period);
    const start = restaurantWallTimeToUtc(`${date}T${period.opensAt}`, timeZone);
    const end = restaurantWallTimeToUtc(
      nextIsException && endMinute > 1440
        ? `${nextDate}T00:00`
        : `${endMinute >= 1440 ? nextDate : date}T${period.closesAt}`,
      timeZone,
    );
    return start && end && end > start ? [{ start, end }] : [];
  });
}

export function serviceIntervalsBetween(schedule: OperatingSchedule, start: Date, end: Date, timeZone?: string | null) {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return [];
  const intervals: ServiceInterval[] = [];
  const lastDate = restaurantDateKey(end, timeZone);
  for (let date = shiftScheduleDate(restaurantDateKey(start, timeZone), -1); date <= lastDate; date = shiftScheduleDate(date, 1)) {
    intervals.push(...intervalsStartingOn(schedule, date, timeZone));
  }
  const merged: ServiceInterval[] = [];
  for (const interval of intervals.sort((a, b) => a.start.getTime() - b.start.getTime())) {
    const clipped = { start: new Date(Math.max(start.getTime(), interval.start.getTime())), end: new Date(Math.min(end.getTime(), interval.end.getTime())) };
    if (clipped.end <= clipped.start) continue;
    const previous = merged.at(-1);
    if (previous && clipped.start <= previous.end) previous.end = new Date(Math.max(previous.end.getTime(), clipped.end.getTime()));
    else merged.push(clipped);
  }
  return merged;
}

export function isWithinServiceHours(source: ScheduleSource, at: Date) {
  if (!Number.isFinite(at.getTime())) return false;
  return serviceIntervalsBetween(readOperatingSchedule(source), at, new Date(at.getTime() + 1), source.timezone).length > 0;
}

export function servicePeriodLabel(period: ServicePeriod) {
  const clock = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
  };
  if (period.opensAt === period.closesAt) return `${clock(period.opensAt)} – ${clock(period.closesAt)} next day (24 hours)`;
  return `${clock(period.opensAt)} – ${clock(period.closesAt)}${period.closesAt < period.opensAt ? " next day" : ""}`;
}

export function restaurantServiceStatus(source: ScheduleSource, now = new Date()) {
  const schedule = readOperatingSchedule(source);
  const date = restaurantDateKey(now, source.timezone);
  const horizonDate = shiftScheduleDate(date, 8);
  // Most restaurants need only today and the previous overnight period.
  // Stop at the first real closing, instead of converting a full week's times
  // for every restaurant on the public directory's refresh.
  const first = (() => {
    let candidate: ServiceInterval | undefined;
    for (let day = shiftScheduleDate(date, -1); day < horizonDate; day = shiftScheduleDate(day, 1)) {
      for (const interval of intervalsStartingOn(schedule, day, source.timezone)) {
        if (interval.end <= now) continue;
        if (candidate && interval.start > candidate.end) return candidate;
        if (candidate) candidate.end = new Date(Math.max(candidate.end.getTime(), interval.end.getTime()));
        else candidate = { start: new Date(Math.max(now.getTime(), interval.start.getTime())), end: interval.end };
      }
      if (candidate && restaurantDateKey(candidate.end, source.timezone) <= day) return candidate;
    }
    return candidate;
  })();
  const openNow = !!first && first.start.getTime() === now.getTime();
  const nextChange = openNow ? (restaurantDateKey(first.end, source.timezone) < horizonDate ? first.end : null) : first?.start ?? null;
  const today = periodsForDate(schedule, date);
  const exception = schedule.exceptions.find((item) => item.date === date);
  const statusLabel = openNow
    ? nextChange ? `Open · closes ${restaurantDateKey(nextChange, source.timezone) === date ? formatRestaurantTime(nextChange, source.timezone) : formatRestaurantDateTime(nextChange, source.timezone)}` : "Open 24 hours"
    : nextChange ? `Closed · opens ${restaurantDateKey(nextChange, source.timezone) === date ? formatRestaurantTime(nextChange, source.timezone) : formatRestaurantDateTime(nextChange, source.timezone)}` : "Closed";
  return {
    openNow,
    statusLabel,
    nextChangeAt: nextChange?.toISOString() ?? null,
    todayHours: today.map(servicePeriodLabel),
    exceptionLabel: exception?.label || null,
    weeklyHours: WEEKDAYS.map((day) => ({ day: weekdayLabel(day), hours: schedule.weekly[day].map(servicePeriodLabel) })),
  };
}
