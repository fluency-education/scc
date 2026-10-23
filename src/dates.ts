const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A calendar date: a `Date`, read in local time, or a "YYYY-MM-DD" string.
 * Only the year, month and day count; the time of day is ignored.
 */
export type CalendarDate = Date | string;

/**
 * The calendar date `day` days after `start`, as a Date at midnight UTC. Days
 * are counted in UTC so that clock changes never make a day longer or shorter.
 */
export function dayToDate(start: CalendarDate, day: number): Date {
  return new Date(toUtcMidnight(start) + day * MS_PER_DAY);
}

/** How many days `date` falls after the Sunday on or before it: 0 for a Sunday, 6 for a Saturday. */
export function daysSinceSunday(date: CalendarDate): number {
  return new Date(toUtcMidnight(date)).getUTCDay();
}

function toUtcMidnight(date: CalendarDate): number {
  if (typeof date === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const [year, month, day] = (match?.slice(1) ?? []).map(Number);
    const time = year === undefined || month === undefined || day === undefined ? NaN : Date.UTC(year, month - 1, day);
    // Date.UTC rolls days over (February 30th becomes March 2nd), so check it kept the date.
    if (Number.isNaN(time) || new Date(time).getUTCDate() !== day) {
      throw new RangeError(`Date must be a real date written YYYY-MM-DD, got "${date}"`);
    }
    return time;
  }
  if (Number.isNaN(date.getTime())) throw new RangeError("Date must be a valid Date");
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** A date as the x-axis writes it, such as "Sep 7". */
export function formatAxisDate(date: Date): string {
  return shortDate.format(date);
}

/** A date as a card writes it, such as "Mon, Sep 7". */
export function formatCardDate(date: Date): string {
  return longDate.format(date);
}
