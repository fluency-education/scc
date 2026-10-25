import { daysSinceSunday } from "./dates.js";
import type { ChartOptions } from "./render.js";
import { DAYS, MAX_FREQUENCY, MIN_FREQUENCY } from "./scale.js";

/** Marks a day with nothing recorded, in corrects, errors and timingSeconds alike. */
export const UNRECORDED = -1;
/** The shortest and longest timings whose record floors fit on the chart (1000 and .001 per minute). */
const SHORTEST_TIMING = 60 / MAX_FREQUENCY;
const LONGEST_TIMING = 60 / MIN_FREQUENCY;

/**
 * Throws if the options are not exactly what renderChart draws, so that a chart
 * never quietly leaves out, misplaces or makes up data. Days are numbered as
 * passed, from the start date.
 */
export function validateOptions({ corrects, errors, timingSeconds, phases, startDate }: ChartOptions): void {
  // The last day the chart has room for, counting from the start date.
  const lastDay = DAYS - (startDate === undefined ? 0 : daysSinceSunday(startDate));
  const room = `the chart only has room for ${lastDay + 1} days${startDate === undefined ? "" : " from its start date"}`;
  const counts = Object.entries({ corrects, errors }).flatMap(([name, list]) => (list === undefined ? [] : [{ name, list }]));
  const lists = timingSeconds === undefined ? counts : [...counts, { name: "timingSeconds", list: timingSeconds }];

  for (const { name, list } of lists) {
    if (!Array.isArray(list)) throw new TypeError(`${name} must be an array of numbers, got ${describe(list)}`);
    // A for loop rather than forEach, which skips the holes in a sparse array.
    for (let day = 0; day < list.length; day++) {
      const value: unknown = list[day];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`${name}[${day}] must be a number, got ${describe(value)}`);
      }
    }
    if (list.length > lastDay + 1) throw new RangeError(`${name} has ${list.length} days, but ${room}`);
  }

  for (const { name, list } of counts) {
    list.forEach((count, day) => {
      if (count !== UNRECORDED && !(Number.isInteger(count) && count >= 0)) {
        throw new RangeError(`${name}[${day}] must be a whole count of 0 or more, or -1 for nothing recorded, got ${count}`);
      }
    });
  }
  timingSeconds?.forEach((seconds, day) => {
    if (seconds !== UNRECORDED && !(seconds >= SHORTEST_TIMING && seconds <= LONGEST_TIMING)) {
      throw new RangeError(
        `timingSeconds[${day}] must be from ${SHORTEST_TIMING} to ${LONGEST_TIMING} seconds, or -1 for no timing, got ${seconds}`,
      );
    }
  });

  if (counts.length > 0 && timingSeconds === undefined) {
    throw new TypeError(`${counts.map(({ name }) => name).join(" and ")} need timingSeconds to be plotted per minute`);
  }
  if (new Set(lists.map(({ list }) => list.length)).size > 1) {
    const lengths = lists.map(({ name, list }) => `${name} has ${list.length}`).join(", ");
    throw new RangeError(`corrects, errors and timingSeconds must have one entry for each day, but ${lengths}`);
  }

  // Each day is either timed, with every count, or unrecorded in every list.
  timingSeconds?.forEach((seconds, day) => {
    for (const { name, list } of counts) {
      const count = list[day] ?? UNRECORDED;
      if (seconds === UNRECORDED && count !== UNRECORDED) {
        throw new RangeError(`Day ${day} has ${name} of ${count} but no timing; give it a timing, or -1 for both`);
      }
      if (seconds !== UNRECORDED && count === UNRECORDED) {
        throw new RangeError(`Day ${day} has a timing but no ${name}; give it a count, or -1 for both`);
      }
      if (seconds !== UNRECORDED && count / (seconds / 60) > MAX_FREQUENCY) {
        throw new RangeError(
          `Day ${day} has ${name} of ${count} in ${seconds} seconds, above the chart's ${MAX_FREQUENCY} per minute`,
        );
      }
    }
  });

  if (phases === undefined) return;
  if (!Array.isArray(phases)) throw new TypeError(`phases must be an array, got ${describe(phases)}`);
  let start = 0;
  phases.forEach((phase: unknown, index) => {
    if (typeof phase !== "object" || phase === null) throw new TypeError(`phases[${index}] must be an object, got ${describe(phase)}`);
    const { name, endDay, aim, celeration } = phase as Record<string, unknown>;
    if (typeof name !== "string") throw new TypeError(`phases[${index}] must have a name, got ${describe(name)}`);
    const isLast = index === phases.length - 1;
    if (start > lastDay) {
      throw new RangeError(`Phase "${name}" starts on day ${start}, but ${room}`);
    }
    if (endDay !== undefined || !isLast) {
      if (typeof endDay !== "number" || !Number.isInteger(endDay) || endDay < start) {
        throw new RangeError(`Phase "${name}" needs an endDay on or after day ${start}, got ${describe(endDay)}`);
      }
      if (endDay > lastDay) throw new RangeError(`Phase "${name}" ends on day ${endDay}, but ${room}`);
      start = endDay + 1;
    }
    if (aim !== undefined && !(typeof aim === "number" && aim >= MIN_FREQUENCY && aim <= MAX_FREQUENCY)) {
      throw new RangeError(`Phase "${name}" needs an aim from ${MIN_FREQUENCY} to ${MAX_FREQUENCY} per minute, got ${describe(aim)}`);
    }
    if (celeration !== undefined && !(typeof celeration === "number" && Number.isFinite(celeration) && celeration > 0)) {
      throw new RangeError(`Phase "${name}" needs a celeration above 0, got ${describe(celeration)}`);
    }
  });
}

/** A value as an error message shows it: strings quoted, so "" and "5" stand out. */
function describe(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}
