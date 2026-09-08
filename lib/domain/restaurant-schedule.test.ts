import { describe, expect, it } from "vitest";
import {
  isWithinServiceHours,
  legacyOperatingSchedule,
  readOperatingSchedule,
  restaurantServiceStatus,
  serviceIntervalsBetween,
  validateOperatingSchedule,
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
