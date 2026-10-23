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
/** Outer and inner radius of an aim star, in SVG units. */
const STAR_RADIUS = 3;
const STAR_INNER_RADIUS = 1.3;
/** Font size of a phase name, in SVG units. */
const PHASE_FONT_SIZE = 5;
/** Rough width of one character of a phase name, as a fraction of its font size. */
const PHASE_CHAR_WIDTH = 0.6;
/** How far a plotted mark reaches from its centre, as far as phase names are concerned. */
const MARK_REACH = 2;
/** Space kept around a phase name: from the chart's edges, other names and marks. */
const PHASE_PADDING = 1.5;
/** How far a phase name moves down each time its spot is taken, in SVG units. */
const PHASE_STEP = 1;

export interface Phase {
  /** Written near the top of the chart within the phase, clear of the data. */
  name: string;
  /**
   * The last day of the phase. A phase line is drawn between it and the next
   * day, so every phase but the last needs one, each after the one before. The
   * last phase has no line; its `endDay` only places its aim star, which
   * otherwise goes on the last day of the chart.
   */
  endDay?: number;
  /**
   * Target count per minute, drawn as a star. With a `celeration`, the star goes
   * on the first whole day the learning line reaches the aim; otherwise, or if
   * the line never reaches it, on the phase's last day.
   */
  aim?: number;
  /**
   * Target celeration per week, such as 2 for ×2 or 0.5 for ÷2. Drawn as a
   * learning line from the phase's first correct, running until it reaches the
   * aim, or to the end of the phase without one.
   */
  celeration?: number;
}

export interface ChartOptions {
  /**
   * Correct counts, one per consecutive day starting at day 0, each divided by
   * that day's timing to plot it per minute. A negative count, or a day without
   * a timing, marks a day with nothing recorded. A count of zero is drawn just
   * under the day's record floor, beside a zero error if there is one.
   * Frequencies or record floors outside .001–1000 and days past the last day
   * of the chart are not drawn. A dashed best fit line runs through the
   * counts in each phase, or the whole chart without phases.
   */
  corrects?: readonly number[];
  /** Error counts, drawn as an X with a red best fit line. Same format as `corrects`. */
  errors?: readonly number[];
  /**
   * Length of each day's timing in seconds, one per consecutive day starting at
   * day 0. Each is drawn as a dash at its record floor, the lowest frequency
   * the timing could record: one count in the timing (1 per minute for 60
   * seconds, .1 for 600). Zero or a negative number marks a day with no timing.
   */
  timingSeconds?: readonly number[];
  /** Consecutive phases of the chart, starting at day 0. */
  phases?: readonly Phase[];
}

/**
 * Renders a daily per-minute Standard Celeration Chart as an SVG string.
 * The SVG fills the width of its container and keeps its proportions.
 */
export function renderChart({
  corrects = [],
  errors = [],
  timingSeconds = [],
  phases = [],
}: ChartOptions = {}): string {
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
   * Where to draw each plottable day, skipping unrecorded and off-chart values.
   * A zero goes just under the day's record floor; when corrects and errors are
   * both zero, each moves toward `side` (-1 left, 1 right) to sit side by side.
   */
  const points = (frequencies: readonly number[], side = 0): Point[] =>
    frequencies.flatMap((frequency, day) => {
      if (day > DAYS) return [];
      if (frequency === 0) {
        const floor = floors[day] ?? -1;
        if (!isPlottable(floor)) return [];
        const bothZero = correctFrequencies[day] === 0 && errorFrequencies[day] === 0;
        return [{ x: x(day) + (bothZero ? side * ZERO_SPREAD : 0), y: y(floor) + ZERO_DROP }];
      }
      return isPlottable(frequency) ? [{ x: x(day), y: y(frequency) }] : [];
    });
  const floorPoints = points(floors);
  const correctPoints = points(correctFrequencies, -1);
  const errorPoints = points(errorFrequencies, 1);

  const spans = phaseSpans(phases);
  const phaseLines = spans
    .slice(0, -1)
    .filter(({ end }) => end + 0.5 <= DAYS)
    // Like the week lines: down past .001, a gap, then a nub up from the zero line.
    .map(({ end }) => {
      const phaseX = round(x(end + 0.5));
      return `<path class="phase" d="M${phaseX} 0V${round(weekTailY)}M${phaseX} ${round(nubY)}V${round(zeroY)}"/>`;
    });
  const learning = spans.map((span) => learningLine(span, correctFrequencies));
  // Without phases, the whole chart gets one pair of best fit lines.
  const fitSpans = spans.length > 0 ? spans : [{ start: 0, end: DAYS }];
  /**
   * Zero has no place on a log scale, so a zero counts as half its day's record
   * floor, following White & Neely (2004). A zero is left out, like its mark,
   * when its record floor is off the chart; so are other frequencies off it.
   */
  const fits = (frequencies: readonly number[]) => {
    const values = frequencies.map((frequency, day) => {
      const floor = floors[day] ?? -1;
      if (frequency === 0) return isPlottable(floor) ? floor / 2 : -1;
      return isPlottable(frequency) ? frequency : -1;
    });
    return fitSpans.flatMap(({ start, end }) => bestFit(values, start, end) ?? []);
  };
  const [correctFits, errorFits] = [fits(correctFrequencies), fits(errorFrequencies)];
  const trendPath = (trend: Trend, cls: string) =>
    `<path class="${cls}" d="M${round(x(trend.start))} ${round(y(trend.from))}L${round(x(trend.end))} ${round(y(trend.to))}"/>`;
  // Points every day along a trend, for phase names to keep clear of.
  const trendPoints = (trend: Trend) =>
    Array.from({ length: Math.floor(trend.end - trend.start) + 1 }, (_, step) => ({
      x: x(trend.start + step),
      y: y(trend.from * trend.celeration ** (step / 7)),
    }));
  const aimPoints = spans.flatMap(({ phase, end }, index) => {
    const day = learning[index]?.aimDay ?? end;
    return phase.aim !== undefined && isPlottable(phase.aim) && day <= DAYS ? [{ x: x(day), y: y(phase.aim) }] : [];
  });
  const phaseNames = placePhaseNames(
    spans.map(({ phase, start, end }) => ({
      name: phase.name,
      left: x(Math.max(start - 0.5, 0)),
      right: x(Math.min(end + 0.5, DAYS)),
    })),
    [
      ...floorPoints,
      ...correctPoints,
      ...errorPoints,
      ...[...learning.flatMap((line) => line ?? []), ...correctFits, ...errorFits].flatMap(trendPoints),
    ],
    aimPoints,
    width,
    height,
  );

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
    ...phaseLines,
    ...learning.flatMap((line) => (line && line.end > line.start ? [trendPath(line, "learning")] : [])),
    ...correctFits.map((fit) => trendPath(fit, "fit correct-fit")),
    ...errorFits.map((fit) => trendPath(fit, "fit error-fit")),
    ...floorPoints.map(dash),
    ...aimPoints.map(star),
    ...correctPoints.map(dot),
    ...errorPoints.map(cross),
    ...phaseNames,
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
.phase { stroke: #111; stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.learning { stroke: #111; stroke-width: 1.25; fill: none; vector-effect: non-scaling-stroke; }
.fit { fill: none; stroke-width: 1.25; stroke-dasharray: 5 3; vector-effect: non-scaling-stroke; }
.correct-fit { stroke: #111; }
.error-fit { stroke: #d62828; }
.aim { fill: #ffd60a; stroke: #1f5f8b; stroke-width: 1; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.phase-name { font-size: ${PHASE_FONT_SIZE}px; text-anchor: middle; fill: #111; paint-order: stroke; stroke: #fff; stroke-width: 1.5px; stroke-linejoin: round; }
`;

interface Point {
  x: number;
  y: number;
}

interface PhaseSpan {
  phase: Phase;
  /** First and last day of the phase. */
  start: number;
  end: number;
}

/** The days each phase covers, checking that the phases run in order. */
function phaseSpans(phases: readonly Phase[]): PhaseSpan[] {
  let start = 0;
  return phases.map((phase, index) => {
    const isLast = index === phases.length - 1;
    const end = phase.endDay ?? DAYS;
    if (!isLast && !(Number.isFinite(phase.endDay) && end >= start)) {
      throw new RangeError(
        `Phase "${phase.name}" needs an endDay on or after day ${start}, got ${phase.endDay}`,
      );
    }
    const span = { phase, start, end };
    start = end + 1;
    return span;
  });
}

/** A straight line on the chart: a frequency changing by a steady celeration. */
interface Trend {
  /** Days the line runs between, and the frequencies at each end. */
  start: number;
  end: number;
  from: number;
  to: number;
  /** Change in frequency per week. */
  celeration: number;
}

interface LearningLine extends Trend {
  /** First whole day the line reaches the aim, if it does. */
  aimDay: number | undefined;
}

/**
 * A phase's learning line: from its first correct above zero, changing by its
 * celeration each week until it reaches the aim. Without an aim the line runs
 * to the end of the phase. It stops at the edges of the chart.
 */
function learningLine({ phase, start, end }: PhaseSpan, corrects: readonly number[]): LearningLine | undefined {
  const { aim, celeration } = phase;
  if (celeration === undefined || !(celeration > 0)) return undefined;
  const first = corrects.findIndex(
    (frequency, day) => day >= start && day <= Math.min(end, DAYS) && frequency > 0 && isPlottable(frequency),
  );
  const from = corrects[first];
  if (from === undefined) return undefined;
  const daysTo = (frequency: number) => (7 * Math.log(frequency / from)) / Math.log(celeration);
  const toAim = aim !== undefined && isPlottable(aim) ? daysTo(aim) : NaN;
  const reachesAim = Number.isFinite(toAim) && toAim >= 0;
  const toEdge = celeration === 1 ? Infinity : daysTo(celeration > 1 ? MAX_FREQUENCY : MIN_FREQUENCY);
  const lineEnd = Math.min(reachesAim ? first + toAim : end, first + toEdge, DAYS);
  return {
    start: first,
    end: lineEnd,
    from,
    to: from * celeration ** ((lineEnd - first) / 7),
    celeration,
    // Allow for rounding error so an aim met on a whole day stays on that day.
    aimDay: reachesAim ? Math.ceil(first + toAim - 1e-9) : undefined,
  };
}

/**
 * The least squares line through the log of each frequency above zero from
 * `start` to `end`, running from the first of them to the last and stopping at
 * the edges of the chart. Needs two days to fit; other days are left out.
 */
function bestFit(frequencies: readonly number[], start: number, end: number): Trend | undefined {
  const days: number[] = [];
  const logs: number[] = [];
  for (let day = start; day <= Math.min(end, DAYS); day++) {
    const frequency = frequencies[day] ?? -1;
    if (frequency > 0) {
      days.push(day);
      logs.push(Math.log10(frequency));
    }
  }
  const [first, last] = [days[0], days.at(-1)];
  if (first === undefined || last === undefined || first === last) return undefined;
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const [meanDay, meanLog] = [mean(days), mean(logs)];
  const slope =
    days.reduce((sum, day, index) => sum + (day - meanDay) * ((logs[index] ?? 0) - meanLog), 0) /
    days.reduce((sum, day) => sum + (day - meanDay) ** 2, 0);
  const logAt = (day: number) => meanLog + slope * (day - meanDay);
  // Days where the line crosses the top and bottom of the chart.
  const [lowestLog, highestLog] = [Math.log10(MIN_FREQUENCY), Math.log10(MAX_FREQUENCY)];
  const crossings =
    slope === 0 ? [] : [lowestLog, highestLog].map((log) => meanDay + (log - meanLog) / slope).sort((a, b) => a - b);
  const [from, to] = [Math.max(first, crossings[0] ?? first), Math.min(last, crossings[1] ?? last)];
  if (!(from < to)) return undefined;
  return { start: from, end: to, from: 10 ** logAt(from), to: 10 ** logAt(to), celeration: 10 ** (slope * 7) };
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Writes each phase name centred over its phase, as near the top of the chart
 * as it can go without covering a mark or another name. A name with nowhere
 * clear to go stays at the top.
 */
function placePhaseNames(
  names: readonly { name: string; left: number; right: number }[],
  marks: readonly Point[],
  aims: readonly Point[],
  width: number,
  height: number,
): string[] {
  const markBoxes = [
    ...marks.map((mark) => ({ mark, reach: MARK_REACH })),
    ...aims.map((mark) => ({ mark, reach: STAR_RADIUS })),
  ].map(({ mark, reach }) => ({
    left: mark.x - reach,
    right: mark.x + reach,
    top: mark.y - reach,
    bottom: mark.y + reach,
  }));
  const placed: Box[] = [];
  return names.map(({ name, left, right }) => {
    const halfWidth = (name.length * PHASE_CHAR_WIDTH * PHASE_FONT_SIZE) / 2;
    const centre = Math.min(
      Math.max((left + right) / 2, halfWidth + PHASE_PADDING),
      width - halfWidth - PHASE_PADDING,
    );
    const boxAt = (top: number): Box => ({
      left: centre - halfWidth,
      right: centre + halfWidth,
      top,
      bottom: top + PHASE_FONT_SIZE,
    });
    const isClear = (box: Box) =>
      ![...markBoxes, ...placed].some(
        (other) =>
          box.left - PHASE_PADDING < other.right &&
          other.left < box.right + PHASE_PADDING &&
          box.top - PHASE_PADDING < other.bottom &&
          other.top < box.bottom + PHASE_PADDING,
      );
    let box = boxAt(PHASE_PADDING);
    for (let top = PHASE_PADDING; top + PHASE_FONT_SIZE <= height; top += PHASE_STEP) {
      if (isClear(boxAt(top))) {
        box = boxAt(top);
        break;
      }
    }
    placed.push(box);
    // The baseline sits below most of the letters, close to the bottom of the box.
    return text(centre, box.bottom - PHASE_FONT_SIZE * 0.2, escapeXml(name), "phase-name");
  });
}

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

function dot({ x: cx, y: cy }: Point): string {
  return `<circle class="correct" cx="${round(cx)}" cy="${round(cy)}" r="${DOT_RADIUS}"/>`;
}

function cross({ x: cx, y: cy }: Point): string {
  const [left, right, top, bottom] = [cx - CROSS_SIZE, cx + CROSS_SIZE, cy - CROSS_SIZE, cy + CROSS_SIZE].map(round);
  return `<path class="error" d="M${left} ${top}L${right} ${bottom}M${left} ${bottom}L${right} ${top}"/>`;
}

function dash({ x: cx, y: cy }: Point): string {
  const [left, right, y] = [cx - FLOOR_SIZE, cx + FLOOR_SIZE, cy].map(round);
  return `<path class="floor" d="M${left} ${y}H${right}"/>`;
}

function star({ x: cx, y: cy }: Point): string {
  const corners = Array.from({ length: 10 }, (_, corner) => {
    const radius = corner % 2 === 0 ? STAR_RADIUS : STAR_INNER_RADIUS;
    const angle = (corner * Math.PI) / 5 - Math.PI / 2;
    return `${round(cx + radius * Math.cos(angle))} ${round(cy + radius * Math.sin(angle))}`;
  });
  return `<path class="aim" d="M${corners.join("L")}Z"/>`;
}

function line(x1: number, y1: number, x2: number, y2: number, cls: string): string {
  return `<line class="${cls}" x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}"/>`;
}

function text(x: number, y: number, content: string, cls: string): string {
  return `<text class="${cls}" x="${round(x)}" y="${round(y)}">${content}</text>`;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
