import { describe, expect, it } from "vitest";
import { dayToDate, daysSinceSunday, formatAxisDate, formatCardDate } from "./dates.js";

describe("dayToDate", () => {
  it("counts days on from a YYYY-MM-DD start", () => {
    expect(dayToDate("2026-09-07", 0).toISOString()).toBe("2026-09-07T00:00:00.000Z");
    expect(dayToDate("2026-09-07", 30).toISOString()).toBe("2026-10-07T00:00:00.000Z");
  });

  it("reads a Date's local year, month and day, ignoring the time", () => {
    expect(dayToDate(new Date(2026, 8, 7, 23, 30), 1).toISOString()).toBe("2026-09-08T00:00:00.000Z");
  });

  it("keeps whole days across clock changes and years", () => {
    expect(dayToDate("2026-10-20", 14).toISOString()).toBe("2026-11-03T00:00:00.000Z");
    expect(dayToDate("2026-12-25", 140).toISOString()).toBe("2027-05-14T00:00:00.000Z");
  });

  it("throws on dates that are not real or not YYYY-MM-DD", () => {
    expect(() => dayToDate("2026-02-30", 0)).toThrow(RangeError);
    expect(() => dayToDate("9/7/2026", 0)).toThrow(RangeError);
    expect(() => dayToDate(new Date("nonsense"), 0)).toThrow(RangeError);
  });
});

describe("daysSinceSunday", () => {
  it("counts back to the Sunday on or before a date", () => {
    expect(daysSinceSunday("2026-09-06")).toBe(0);
    expect(daysSinceSunday("2026-09-07")).toBe(1);
    expect(daysSinceSunday("2026-09-12")).toBe(6);
    expect(daysSinceSunday(new Date(2026, 8, 12, 23, 59))).toBe(6);
  });
});

describe("formatting", () => {
  const date = dayToDate("2026-09-07", 0);

  it("writes axis dates as month and day", () => {
    expect(formatAxisDate(date)).toBe("Sep 7");
  });

  it("writes card dates with the weekday", () => {
    expect(formatCardDate(date)).toBe("Mon, Sep 7");
  });
});
