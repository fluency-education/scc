import { DAYS, MAX_FREQUENCY, MIN_FREQUENCY, dayScale, frequencyScale, toFrequency } from "./scale.js";

/** Angle at which a ×2 per week celeration line rises on a standard chart. */
const CELERATION_ANGLE = 34;
/** Powers of ten from MIN_FREQUENCY (10^-3) up to MAX_FREQUENCY (10^3). */
const LOWEST_POWER = -3;
const HIGHEST_POWER = 3;
/*
 * Zero has no place on a log scale, so it gets its own row below .001. These
 * distances are fractions of one ×10 cycle, measured from a printed chart.
 */
/** From the .001 line down to the zero line. */
const ZERO_GAP = 0.375;
/** How far below .001 the week lines run before the gap. */
const WEEK_TAIL = 0.275;
/** Height of the tick each day gets rising from the zero line. */
const NUB = 0.0625;
/** The thin grid carries on below .001 at these frequencies. */
const BELOW_FLOOR = [0.0009, 0.0008, 0.0007];

/**
 * Width of one day in SVG units. The chart scales to fill its container, so
 * this sets the proportions of the grid rather than its size on screen.
 */
export const DAY_WIDTH = 3;

const MARGIN = { top: 12, right: 12, bottom: 30, left: 38 };

/** Grid height that keeps the standard celeration angle for a given width. */
export function chartHeight(width: number): number {
  const weekWidth = (width / DAYS) * 7;
  const doublingHeight = weekWidth * Math.tan((CELERATION_ANGLE * Math.PI) / 180);
  const cycles = HIGHEST_POWER - LOWEST_POWER;
  return (doublingHeight / Math.log10(2)) * cycles;
}

/** Radius of a plotted correct dot, in SVG units. */
const DOT_RADIUS = 1.1;
/** Half the width of a plotted error X, in SVG units. */
const CROSS_SIZE = 1.1;
/** Half the width of a record floor dash, in SVG units. */
const FLOOR_SIZE = 1.1;
/** How far below its record floor a zero count is drawn, in SVG units. */
const ZERO_DROP = 1.75;
/**
 * How far a zero correct and a zero error on the same day are moved apart,
 * each to its own side of the day line, in SVG units.
 */
const ZERO_SPREAD = 1.25;

export interface ChartOptions {
  /**
   * Correct counts, one per consecutive day starting at day 0, each divided by
   * that day's timing to plot it per minute. A negative count, or a day without
   * a timing, marks a day with nothing recorded. A count of zero is drawn just
   * under the day's record floor, beside a zero error if there is one.
   * Frequencies or record floors outside .001–1000 and days past the last day
   * of the chart are not drawn.
   */
  corrects?: readonly number[];
  /** Error counts, drawn as an X. Same format as `corrects`. */
  errors?: readonly number[];
  /**
   * Length of each day's timing in seconds, one per consecutive day starting at
   * day 0. Each is drawn as a dash at its record floor, the lowest frequency
   * the timing could record: one count in the timing (1 per minute for 60
   * seconds, .1 for 600). Zero or a negative number marks a day with no timing.
   */
  timingSeconds?: readonly number[];
}

/**
 * Renders a daily per-minute Standard Celeration Chart as an SVG string.
 * The SVG fills the width of its container and keeps its proportions.
 */
export function renderChart({ corrects = [], errors = [], timingSeconds = [] }: ChartOptions = {}): string {
  const width = DAYS * DAY_WIDTH;
  const height = chartHeight(width);
  const x = dayScale({ left: 0, right: width });
  const y = frequencyScale({ top: 0, bottom: height });
  const cycle = height / (HIGHEST_POWER - LOWEST_POWER);
  const zeroY = height + cycle * ZERO_GAP;
  const floorY = y(Math.min(...BELOW_FLOOR));
  const weekTailY = height + cycle * WEEK_TAIL;
  const nubY = zeroY - cycle * NUB;
  // Each layer is drawn over the one before, so thick lines are never
  // broken up by the thin lines that cross them.
  const thinRows: string[] = [];
  const thinColumns: string[] = [];
  const thickRows: string[] = [];
  const thickColumns: string[] = [];
  const parts: string[] = [];

  for (let power = LOWEST_POWER; power <= HIGHEST_POWER; power++) {
    const decade = 10 ** power;
    thickRows.push(line(0, y(decade), width, y(decade), "decade"));
    parts.push(text(-4, y(decade) + 2, formatFrequency(decade), "y-label"));
    if (power === HIGHEST_POWER) break;
    for (let n = 2; n <= 9; n++) {
      const row = line(0, y(n * decade), width, y(n * decade), n === 5 ? "half" : "unit");
      (n === 5 ? thickRows : thinRows).push(row);
    }
    const half = 5 * decade;
    parts.push(text(-4, y(half) + 1.5, formatFrequency(half), "y-label half-label"));
  }
  for (const frequency of BELOW_FLOOR) {
    thinRows.push(line(0, y(frequency), width, y(frequency), "unit"));
  }
  thickRows.push(line(0, zeroY, width, zeroY, "zero"));
  parts.push(text(-4, zeroY + 2, "0", "y-label"));

  for (let day = 0; day <= DAYS; day++) {
    if (day % 7 === 0) {
      thickColumns.push(line(x(day), 0, x(day), weekTailY, "week"));
      thickColumns.push(line(x(day), nubY, x(day), zeroY, "week nub"));
    } else {
      thinColumns.push(line(x(day), 0, x(day), floorY, "day"));
      thinColumns.push(line(x(day), nubY, x(day), zeroY, "day nub"));
    }
  }
  for (let day = 0; day <= DAYS; day += 14) {
    parts.push(text(x(day), zeroY + 9, String(day), "x-label"));
  }

  parts.push(text(width / 2, zeroY + 21, "Successive calendar days", "title"));
  parts.push(
    `<text class="title" transform="translate(-28 ${round(height / 2)}) rotate(-90)">Count per minute</text>`,
  );

  const floors = perMinute(timingSeconds.map(() => 1), timingSeconds);
  const correctFrequencies = perMinute(corrects, timingSeconds);
  const errorFrequencies = perMinute(errors, timingSeconds);

  /**
   * One mark per plottable day, skipping unrecorded and off-chart values. A
   * zero goes just under the day's record floor; when corrects and errors are
   * both zero, each moves toward `side` (-1 left, 1 right) to sit side by side.
   */
  const marks = (frequencies: readonly number[], mark: (cx: number, cy: number) => string, side = 0) =>
    frequencies.flatMap((frequency, day) => {
      if (day > DAYS) return [];
      if (frequency === 0) {
        const floor = floors[day] ?? -1;
        if (!isPlottable(floor)) return [];
        const bothZero = correctFrequencies[day] === 0 && errorFrequencies[day] === 0;
        return [mark(x(day) + (bothZero ? side * ZERO_SPREAD : 0), y(floor) + ZERO_DROP)];
      }
      return isPlottable(frequency) ? [mark(x(day), y(frequency))] : [];
    });

  const totalWidth = width + MARGIN.left + MARGIN.right;
  const totalHeight = zeroY + MARGIN.top + MARGIN.bottom;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(totalWidth)} ${round(totalHeight)}" style="display: block; width: 100%; height: auto">`,
    `<style>${STYLE}</style>`,
    `<g transform="translate(${MARGIN.left} ${MARGIN.top})">`,
    ...thinRows,
    ...thinColumns,
    ...thickRows,
    ...thickColumns,
    ...marks(floors, dash),
    ...marks(correctFrequencies, dot, -1),
    ...marks(errorFrequencies, cross, 1),
    ...parts,
    `</g>`,
    `</svg>`,
  ].join("\n");
}

const STYLE = `
/* Strokes are in screen pixels, so lines stay hairlines however far the chart is scaled. */
line { stroke: #4a9fd8; stroke-width: 1; vector-effect: non-scaling-stroke; }
.day, .unit { stroke: #c4e0f4; }
.half { stroke: #8cc4e9; }
.week, .decade, .zero { stroke-width: 2; }
.correct { fill: #111; }
.floor { stroke: #111; stroke-width: 1.25; vector-effect: non-scaling-stroke; }
.error { stroke: #d62828; stroke-width: 1.25; fill: none; vector-effect: non-scaling-stroke; }
text { font-family: system-ui, sans-serif; fill: #1f5f8b; }
.x-label { font-size: 5.5px; text-anchor: middle; }
.y-label { font-size: 5.5px; text-anchor: end; }
.half-label { font-size: 4.5px; opacity: 0.8; }
.title { font-size: 6.5px; text-anchor: middle; }
`;

function formatFrequency(frequency: number): string {
  return frequency < 1 ? String(frequency).replace(/^0/, "") : String(frequency);
}


/**
 * Each day's count per minute of its timing, or -1 (unrecorded) for a day
 * without a count or a timing.
 */
function perMinute(counts: readonly number[], timingSeconds: readonly number[]): number[] {
  return counts.map((count, day) => {
    const seconds = timingSeconds[day] ?? -1;
    return count >= 0 && seconds > 0 ? toFrequency(count, seconds / 60) : -1;
  });
}

function isPlottable(frequency: number): boolean {
  return frequency >= MIN_FREQUENCY && frequency <= MAX_FREQUENCY;
}

function dot(cx: number, cy: number): string {
  return `<circle class="correct" cx="${round(cx)}" cy="${round(cy)}" r="${DOT_RADIUS}"/>`;
}

function cross(cx: number, cy: number): string {
  const [left, right, top, bottom] = [cx - CROSS_SIZE, cx + CROSS_SIZE, cy - CROSS_SIZE, cy + CROSS_SIZE].map(round);
  return `<path class="error" d="M${left} ${top}L${right} ${bottom}M${left} ${bottom}L${right} ${top}"/>`;
}

function dash(cx: number, cy: number): string {
  const [left, right, y] = [cx - FLOOR_SIZE, cx + FLOOR_SIZE, cy].map(round);
  return `<path class="floor" d="M${left} ${y}H${right}"/>`;
}

function line(x1: number, y1: number, x2: number, y2: number, cls: string): string {
  return `<line class="${cls}" x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}"/>`;
}

function text(x: number, y: number, content: string, cls: string): string {
  return `<text class="${cls}" x="${round(x)}" y="${round(y)}">${content}</text>`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
