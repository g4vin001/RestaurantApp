import { describe, expect, it } from "vitest";
import {
  fitsWithinServiceHours,
  formatDurationMinutes,
  isReservationDateBlocked,
  isWithinReservationWindows,
  isWithinServiceHours,
  legacyOperatingSchedule,
  readOperatingSchedule,
  readReservationAvailability,
  readReservationNotes,
  readReservationWindows,
  reservationWindowLabels,
  readReservationDurationMinutes,
  restaurantServiceStatus,
  serviceIntervalsBetween,
  shortestServicePeriod,
  validateBlockedDates,
  validateOperatingSchedule,
  validateReservationDuration,
  validateReservationWindows,
  WEEKDAYS,
  type OperatingSchedule,
} from "./restaurant-schedule";

function closedWeek(): OperatingSchedule {
  const schedule = legacyOperatingSchedule();
  for (const day of WEEKDAYS) schedule.weekly[day] = [];
  return schedule;
}
const at = (value: string) => new Date(`${value}:00+08:00`);
const within = (schedule: OperatingSchedule, value: string) => isWithinServiceHours({ schedule, timezone: "Asia/Manila" }, at(value));

describe("restaurant service schedules", () => {
  it("preserves legacy daily hours, including midnight closing", () => {
    const schedule = readOperatingSchedule({ opensAtHour: 11, closesAtHour: 24 });
    expect(schedule.weekly.monday).toEqual([{ opensAt: "11:00", closesAt: "00:00" }]);
    expect(within(schedule, "2026-09-07T23:59")).toBe(true);
    expect(within(schedule, "2026-09-08T00:00")).toBe(false);
  });

  it("respects weekdays, split shifts, and exact opening/closing boundaries", () => {
    const schedule = closedWeek();
    schedule.weekly.monday = [{ opensAt: "11:30", closesAt: "14:00" }, { opensAt: "17:00", closesAt: "22:15" }];
    for (const time of ["11:30", "13:59", "17:00", "22:14"]) expect(within(schedule, `2026-09-07T${time}`)).toBe(true);
    for (const time of ["11:29", "14:00", "16:59", "22:15"]) expect(within(schedule, `2026-09-07T${time}`)).toBe(false);
    expect(within(schedule, "2026-09-08T12:00")).toBe(false);
  });

  it("carries overnight service into a weekday with no new service", () => {
    const schedule = closedWeek();
    schedule.weekly.sunday = [{ opensAt: "20:00", closesAt: "02:00" }];
    expect(within(schedule, "2026-09-07T01:59")).toBe(true);
    expect(within(schedule, "2026-09-07T02:00")).toBe(false);
    const intervals = serviceIntervalsBetween(schedule, at("2026-09-07T00:00"), at("2026-09-07T03:00"), "Asia/Manila");
    expect(intervals).toEqual([{ start: at("2026-09-07T00:00"), end: at("2026-09-07T02:00") }]);
  });

  it("closes an entire holiday from midnight, including the previous night's service", () => {
    const schedule = closedWeek();
    schedule.weekly.sunday = [{ opensAt: "20:00", closesAt: "02:00" }];
    schedule.exceptions = [{ date: "2026-09-07", label: "Holiday", periods: [] }];
    expect(within(schedule, "2026-09-06T23:59")).toBe(true);
    expect(within(schedule, "2026-09-07T00:00")).toBe(false);
    expect(restaurantServiceStatus({ schedule }, at("2026-09-07T01:00"))).toMatchObject({ openNow: false, exceptionLabel: "Holiday", todayHours: [] });
  });

  it("replaces regular hours on a special date and resumes the weekly schedule afterward", () => {
    const schedule = legacyOperatingSchedule(10, 22);
    schedule.exceptions = [{ date: "2026-09-07", label: "Private lunch", periods: [{ opensAt: "17:00", closesAt: "20:00" }] }];
    expect(within(schedule, "2026-09-07T12:00")).toBe(false);
    expect(within(schedule, "2026-09-07T18:00")).toBe(true);
    expect(within(schedule, "2026-09-08T12:00")).toBe(true);
  });

  it("allows a special opening on a closed weekday and carries it overnight", () => {
    const schedule = closedWeek();
    schedule.exceptions = [{ date: "2026-09-07", label: "Late service", periods: [{ opensAt: "19:00", closesAt: "01:30" }] }];
    expect(validateOperatingSchedule(schedule).ok).toBe(true);
    expect(within(schedule, "2026-09-08T01:29")).toBe(true);
    expect(within(schedule, "2026-09-08T01:30")).toBe(false);
  });

  it("supports continuous 24-hour service without a false daily closing", () => {
    const schedule = legacyOperatingSchedule(0, 24);
    expect(validateOperatingSchedule(schedule).ok).toBe(true);
    expect(restaurantServiceStatus({ schedule }, at("2026-09-07T23:59"))).toMatchObject({ openNow: true, nextChangeAt: null, statusLabel: "Open 24 hours" });
  });

  it("merges adjacent periods and reports the next real opening after a break", () => {
    const schedule = closedWeek();
    schedule.weekly.monday = [{ opensAt: "11:00", closesAt: "14:00" }, { opensAt: "14:00", closesAt: "16:00" }, { opensAt: "18:00", closesAt: "22:00" }];
    expect(restaurantServiceStatus({ schedule }, at("2026-09-07T12:00"))).toMatchObject({ openNow: true, nextChangeAt: at("2026-09-07T16:00").toISOString() });
    expect(restaurantServiceStatus({ schedule }, at("2026-09-07T16:00"))).toMatchObject({ openNow: false, nextChangeAt: at("2026-09-07T18:00").toISOString() });
  });

  it("rejects overlapping weekly periods, including the Sunday-to-Monday boundary", () => {
    const schedule = closedWeek();
    schedule.weekly.sunday = [{ opensAt: "20:00", closesAt: "02:00" }];
    schedule.weekly.monday = [{ opensAt: "01:00", closesAt: "03:00" }];
    expect(validateOperatingSchedule(schedule)).toMatchObject({ ok: false, error: expect.stringContaining("overlap") });
  });

  it("rejects overlapping special hours and the following day's regular hours", () => {
    const schedule = legacyOperatingSchedule(10, 22);
    schedule.exceptions = [{ date: "2026-09-07", label: "Late", periods: [{ opensAt: "20:00", closesAt: "11:00" }] }];
    expect(validateOperatingSchedule(schedule).ok).toBe(false);
    schedule.exceptions.push({ date: "2026-09-08", label: "Closed", periods: [] });
    expect(validateOperatingSchedule(schedule).ok).toBe(true);
  });

  it.each(["2026-02-30", "2026-13-01", "not-a-date"])("rejects the impossible special date %s", (date) => {
    const schedule = closedWeek();
    schedule.exceptions.push({ date, label: "Holiday", periods: [] });
    expect(validateOperatingSchedule(schedule).ok).toBe(false);
  });

  it("rejects missing weekdays, invalid times, duplicate dates, and unbounded period lists", () => {
    const schedule = legacyOperatingSchedule();
    expect(validateOperatingSchedule({ weekly: {}, exceptions: [] }).ok).toBe(false);
    schedule.weekly.monday[0].opensAt = "25:00";
    expect(validateOperatingSchedule(schedule).ok).toBe(false);
    schedule.weekly.monday = Array.from({ length: 5 }, () => ({ opensAt: "10:00", closesAt: "11:00" }));
    expect(validateOperatingSchedule(schedule).ok).toBe(false);
    schedule.weekly.monday = [];
    schedule.exceptions = Array.from({ length: 2 }, () => ({ date: "2026-09-07", label: "", periods: [] }));
    expect(validateOperatingSchedule(schedule).ok).toBe(false);
  });

  it("does not advertise service when stored schedule data is malformed", () => {
    expect(isWithinServiceHours({ schedule: { weekly: {} } }, at("2026-09-07T12:00"))).toBe(false);
    expect(isWithinServiceHours({}, new Date("invalid"))).toBe(false);
  });

  it("uses the restaurant's timezone rather than the browser or server timezone", () => {
    const schedule = legacyOperatingSchedule(10, 22);
    const instant = new Date("2026-09-07T03:00:00Z");
    expect(isWithinServiceHours({ schedule, timezone: "Asia/Manila" }, instant)).toBe(true);
    expect(isWithinServiceHours({ schedule, timezone: "UTC" }, instant)).toBe(false);
  });

  it("counts real elapsed time across a daylight-saving transition", () => {
    const intervals = serviceIntervalsBetween(legacyOperatingSchedule(0, 24), new Date("2026-03-08T05:00:00Z"), new Date("2026-03-09T04:00:00Z"), "America/New_York");
    expect(intervals.reduce((sum, item) => sum + (item.end.getTime() - item.start.getTime()) / 3_600_000, 0)).toBe(23);
  });
});

describe("reservation length", () => {
  const fits = (schedule: OperatingSchedule, value: string, minutes: number) =>
    fitsWithinServiceHours({ schedule, timezone: "Asia/Manila" }, at(value), minutes);

  it("defaults to 90 minutes when unset or invalid", () => {
    expect(readReservationDurationMinutes({})).toBe(90);
    expect(readReservationDurationMinutes({ reservationDurationMinutes: "120" })).toBe(90);
    expect(readReservationDurationMinutes({ reservationDurationMinutes: 120 })).toBe(120);
    expect(formatDurationMinutes(90)).toBe("1 hr 30 min");
    expect(formatDurationMinutes(120)).toBe("2 hr");
    expect(formatDurationMinutes(45)).toBe("45 min");
  });

  it("caps the length at the shortest weekly period, including overnight ones", () => {
    const schedule = closedWeek();
    schedule.weekly.monday = [{ opensAt: "11:00", closesAt: "13:30" }, { opensAt: "17:00", closesAt: "22:00" }];
    schedule.weekly.friday = [{ opensAt: "20:00", closesAt: "02:00" }];
    expect(shortestServicePeriod(schedule)).toEqual({ day: "monday", minutes: 150 });
    expect(validateReservationDuration(150, schedule).ok).toBe(true);
    const tooLong = validateReservationDuration(180, schedule);
    expect(tooLong.ok).toBe(false);
    expect(!tooLong.ok && tooLong.error).toContain("Monday, 2 hr 30 min");
    expect(validateReservationDuration(100, schedule).ok).toBe(false);
    expect(validateReservationDuration(105, schedule).ok).toBe(false);
  });

  it("ignores special dates when capping the length", () => {
    const schedule = legacyOperatingSchedule(10, 22);
    schedule.exceptions = [{ date: "2026-12-24", label: "Christmas Eve", periods: [{ opensAt: "10:00", closesAt: "11:00" }] }];
    expect(validateReservationDuration(120, schedule).ok).toBe(true);
    expect(fits(schedule, "2026-12-24T10:00", 120)).toBe(false);
  });

  it("requires a booking to finish by closing time", () => {
    const schedule = legacyOperatingSchedule(10, 22);
    expect(fits(schedule, "2026-09-07T20:30", 90)).toBe(true);
    expect(fits(schedule, "2026-09-07T20:31", 90)).toBe(false);
    expect(fits(schedule, "2026-09-07T09:59", 90)).toBe(false);
  });

  it("allows a stay that runs past midnight in one continuous period", () => {
    const schedule = closedWeek();
    schedule.weekly.friday = [{ opensAt: "20:00", closesAt: "02:00" }];
    expect(fits(schedule, "2026-09-11T23:30", 150)).toBe(true);
    expect(fits(schedule, "2026-09-11T23:31", 150)).toBe(false);
  });
});

describe("reservation availability", () => {
  it("limits reservation start times to the weekly windows, when set", () => {
    const windows = closedWeek().weekly;
    windows.monday = [{ opensAt: "11:30", closesAt: "13:30" }, { opensAt: "18:00", closesAt: "20:30" }];
    // 2026-09-07 is a Monday in Asia/Manila.
    expect(isWithinReservationWindows(windows, at("2026-09-07T11:30"), "Asia/Manila")).toBe(true);
    expect(isWithinReservationWindows(windows, at("2026-09-07T13:29"), "Asia/Manila")).toBe(true);
    expect(isWithinReservationWindows(windows, at("2026-09-07T13:30"), "Asia/Manila")).toBe(false);
    expect(isWithinReservationWindows(windows, at("2026-09-07T16:00"), "Asia/Manila")).toBe(false);
    expect(isWithinReservationWindows(windows, at("2026-09-08T19:00"), "Asia/Manila")).toBe(false);
    expect(isWithinReservationWindows(null, at("2026-09-08T19:00"), "Asia/Manila")).toBe(true);
    expect(reservationWindowLabels(windows, "2026-09-07")).toEqual(["11:30 AM – 1:30 PM", "6:00 PM – 8:30 PM"]);
  });

  it("validates reservation windows like opening hours, with off meaning null", () => {
    expect(validateReservationWindows(null)).toEqual({ ok: true, windows: null });
    expect(readReservationWindows({})).toBeNull();
    const overlapping = closedWeek().weekly;
    overlapping.friday = [{ opensAt: "18:00", closesAt: "21:00" }, { opensAt: "20:00", closesAt: "22:00" }];
    expect(validateReservationWindows(overlapping).ok).toBe(false);
    expect(validateReservationWindows({ monday: [] }).ok).toBe(false);
  });

  it("reads the manager's notes for customers, trimmed and length-capped", () => {
    expect(readReservationNotes({})).toBe("");
    expect(readReservationNotes({ reservationNotes: 42 })).toBe("");
    expect(readReservationNotes({ reservationNotes: "  Held for 15 minutes.\nNo deposit needed.  " }))
      .toBe("Held for 15 minutes.\nNo deposit needed.");
    expect(readReservationNotes({ reservationNotes: "x".repeat(600) })).toHaveLength(500);
  });

  it("defaults to accepting reservations with no blocked dates", () => {
    expect(readReservationAvailability({})).toEqual({ acceptsReservations: true, blockedDates: [] });
    expect(readReservationAvailability({ acceptsReservations: false, reservationBlockedDates: "nope" }))
      .toEqual({ acceptsReservations: false, blockedDates: [] });
  });

  it("validates, dedupes, and sorts blocked dates", () => {
    expect(validateBlockedDates(["2026-12-25", "2026-12-24", "2026-12-25"])).toEqual({ ok: true, dates: ["2026-12-24", "2026-12-25"] });
    expect(validateBlockedDates(["2026-02-30"]).ok).toBe(false);
    expect(validateBlockedDates("2026-12-25").ok).toBe(false);
  });

  it("checks blocked dates in restaurant time, not UTC", () => {
    // 23:30 on the 24th in Manila is 15:30 UTC on the 24th; 00:30 on the 25th is still the 24th in UTC.
    expect(isReservationDateBlocked(["2026-12-25"], at("2026-12-24T23:30"), "Asia/Manila")).toBe(false);
    expect(isReservationDateBlocked(["2026-12-25"], at("2026-12-25T00:30"), "Asia/Manila")).toBe(true);
  });
});
