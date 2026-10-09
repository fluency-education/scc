/** Lowest frequency on a daily per-minute chart (1 per 1000 minutes). */
export const MIN_FREQUENCY = 0.001;
/** Highest frequency on a daily per-minute chart. */
export const MAX_FREQUENCY = 1000;
/** Successive calendar days on the x-axis of a daily chart. */
export const DAYS = 140;

export interface FrequencyScaleOptions {
  /** Pixel position of MAX_FREQUENCY (top of the chart). */
  top: number;
  /** Pixel position of MIN_FREQUENCY (bottom of the chart). */
  bottom: number;
}

/**
 * Maps a count-per-minute value onto the chart's logarithmic y-axis,
 * returning a pixel position between `bottom` and `top`.
 */
export function frequencyScale({ top, bottom }: FrequencyScaleOptions) {
  const minLog = Math.log10(MIN_FREQUENCY);
  const span = Math.log10(MAX_FREQUENCY) - minLog;

  return (frequency: number): number => {
    if (!(frequency > 0)) {
      throw new RangeError(`Frequency must be positive, got ${frequency}`);
    }
    const t = (Math.log10(frequency) - minLog) / span;
    return bottom + t * (top - bottom);
  };
}

/** Converts a count and observation time (in minutes) into a per-minute frequency. */
export function toFrequency(count: number, minutes: number): number {
  if (!(minutes > 0)) {
    throw new RangeError(`Minutes must be positive, got ${minutes}`);
  }
  return count / minutes;
}

export interface DayScaleOptions {
  /** Pixel position of day 0. */
  left: number;
  /** Pixel position of the last day (DAYS). */
  right: number;
}

/** Maps a day number (0 to DAYS) onto the chart's linear x-axis. */
export function dayScale({ left, right }: DayScaleOptions) {
  return (day: number): number => left + (day / DAYS) * (right - left);
}
