import { type CalendarDate, dayToDate, daysSinceSunday, formatAxisDate, formatCardDate } from "./dates.js";
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
/**
 * How far the zoomable plot reaches past the grid on each side, so lines and
 * stars on its edges are not clipped.
 */
const PLOT_PADDING = 3;
/** Room kept around the current phase when zooming in on it, in SVG units. */
const FOCUS_PADDING = 6;
/** Radius around a plotted mark that brings up its card, in SVG units. */
const HOVER_RADIUS = 2.25;
/** Celeration a correct's next-day target grows by when its phase has none. */
const DEFAULT_CELERATION = 2;
/** Size of a zoom button, in SVG units. */
const ZOOM_BUTTON = 7;

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
  /**
   * The date of day 0. With it, the x-axis and cards show dates instead of day
   * numbers, and the x-axis title gives the year or years the chart covers.
   * The chart starts on the Sunday on or before it, so weeks run Sunday to
   * Saturday; counts, timings and phase end days still count from it, and the
   * days before it are left empty.
   */
  startDate?: CalendarDate;
}

/**
 * Renders a daily per-minute Standard Celeration Chart as an SVG string.
 * The SVG fills the width of its container and keeps its proportions. Its zoom
 * control stays hidden until the chart is passed to enableZoom, and its marks
 * and lines show their details on hover once it is passed to enableHover.
 */
export function renderChart({ phases = [], startDate, ...counts }: ChartOptions = {}): string {
  // A dated chart starts on the Sunday on or before the start date, leaving the
  // days between unrecorded. Counts, timings and end days still count from the
  // start date; everything below counts from the chart's first day.
  const offset = startDate === undefined ? 0 : daysSinceSunday(startDate);
  const unrecorded = Array<number>(offset).fill(-1);
  const corrects = [...unrecorded, ...(counts.corrects ?? [])];
  const errors = [...unrecorded, ...(counts.errors ?? [])];
  const timingSeconds = [...unrecorded, ...(counts.timingSeconds ?? [])];
  // Most days are named on several cards, and working out and writing a date is slow, so each is done once.
  const dateOf = perDay((day) => (startDate === undefined ? undefined : dayToDate(startDate, day - offset)));
  /** How the x-axis and cards name a day: its date, or its number without a start date. */
  const axisDay = (day: number) => {
    const date = dateOf(day);
    return date ? formatAxisDate(date) : String(day);
  };
  const cardDay = perDay((day) => {
    const date = dateOf(day);
    return date ? formatCardDate(date) : `Day ${day}`;
  });
  const width = DAYS * DAY_WIDTH;
  const height = chartHeight(width);
  const x = dayScale({ left: 0, right: width });
  const y = frequencyScale({ top: 0, bottom: height });
  const cycle = height / (HIGHEST_POWER - LOWEST_POWER);
  const zeroY = height + cycle * ZERO_GAP;
  const floorY = y(Math.min(...BELOW_FLOOR));
  const weekTailY = height + cycle * WEEK_TAIL;
  const nubY = zeroY - cycle * NUB;
  // Each kind of grid line is one path, as hundreds of separate lines would
  // each be redrawn whenever the chart zooms or pans. The paths are drawn in
  // this order, so thick lines are never broken up by the thin lines that
  // cross them: thin rows, thin columns, thick rows, then thick columns.
  const grid = {
    unit: [] as string[],
    day: [] as string[],
    "day nub": [] as string[],
    decade: [] as string[],
    half: [] as string[],
    zero: [] as string[],
    week: [] as string[],
    "week nub": [] as string[],
  };
  const row = (cls: keyof typeof grid, rowY: number) => grid[cls].push(`M0 ${round(rowY)}H${round(width)}`);
  const column = (cls: keyof typeof grid, columnX: number, top: number, bottom: number) =>
    grid[cls].push(`M${round(columnX)} ${round(top)}V${round(bottom)}`);
  const parts: string[] = [];

  for (let power = LOWEST_POWER; power <= HIGHEST_POWER; power++) {
    const decade = 10 ** power;
    row("decade", y(decade));
    parts.push(text(-4, y(decade) + 2, formatFrequency(decade), "y-label", { y: y(decade) }));
    if (power === HIGHEST_POWER) break;
    for (let n = 2; n <= 9; n++) row(n === 5 ? "half" : "unit", y(n * decade));
    const half = 5 * decade;
    parts.push(text(-4, y(half) + 1.5, formatFrequency(half), "y-label half-label", { y: y(half) }));
  }
  for (const frequency of BELOW_FLOOR) row("unit", y(frequency));
  row("zero", zeroY);
  parts.push(text(-4, zeroY + 2, "0", "y-label", { y: zeroY }));

  for (let day = 0; day <= DAYS; day++) {
    if (day % 7 === 0) {
      column("week", x(day), 0, weekTailY);
      column("week nub", x(day), nubY, zeroY);
    } else {
      column("day", x(day), 0, floorY);
      column("day nub", x(day), nubY, zeroY);
    }
  }
  for (let day = 0; day <= DAYS; day += 14) {
    parts.push(text(x(day), zeroY + 9, axisDay(day), "x-label", { x: x(day) }));
  }

  const [firstYear, lastYear] = [dateOf(0)?.getUTCFullYear(), dateOf(DAYS)?.getUTCFullYear()];
  const years = firstYear === lastYear ? `${firstYear}` : `${firstYear}–${lastYear}`;
  parts.push(
    text(width / 2, zeroY + 21, `Successive calendar days${startDate === undefined ? "" : ` · ${years}`}`, "title"),
  );
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
  const points = (frequencies: readonly number[], side = 0): Mark[] =>
    frequencies.flatMap((frequency, day) => {
      if (day > DAYS) return [];
      if (frequency === 0) {
        const floor = floors[day] ?? -1;
        if (!isPlottable(floor)) return [];
        const bothZero = correctFrequencies[day] === 0 && errorFrequencies[day] === 0;
        return [{ x: x(day) + (bothZero ? side * ZERO_SPREAD : 0), y: y(floor) + ZERO_DROP, day, frequency }];
      }
      return isPlottable(frequency) ? [{ x: x(day), y: y(frequency), day, frequency }] : [];
    });
  const floorPoints = points(floors);
  const correctPoints = points(correctFrequencies, -1);
  const errorPoints = points(errorFrequencies, 1);

  const spans = phaseSpans(phases, offset);
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
  /** A trend with its card, over a wider unpainted copy that is easier to point at. */
  const trendPath = (trend: Trend, cls: string, name: string) => {
    const d = `M${round(x(trend.start))} ${round(y(trend.from))}L${round(x(trend.end))} ${round(y(trend.to))}`;
    const card = cardAttributes([name, `${formatCeleration(trend.celeration)} per week`]);
    return `<g class="trend"${card}><path class="${cls}" d="${d}"/><path class="hover-area" d="${d}"/></g>`;
  };
  /** The count a day's rate came from, and the timing it was counted in. */
  const counted = (counts: readonly number[], day: number) =>
    `${counts[day]} in a ${formatTiming(timingSeconds[day] ?? 0)} timing`;
  /**
   * A correct's card: its rate, and the target for the next recorded day, at
   * its phase's celeration from this one. Once that day is recorded, whether it
   * hit the target: reaching it, or for a falling celeration, staying under it.
   */
  const correctCard = ({ day, frequency }: Mark) => {
    const lines = [`${cardDay(day)} · Correct`, `${formatRate(frequency)} per minute`, counted(corrects, day)];
    if (frequency === 0) return cardAttributes(lines);
    const celeration = spans.find(({ start, end }) => day >= start && day <= end)?.phase.celeration ?? DEFAULT_CELERATION;
    const recorded = correctFrequencies.findIndex((next, nextDay) => nextDay > day && next >= 0);
    const nextDay = recorded === -1 ? day + 1 : recorded;
    const target = frequency * celeration ** ((nextDay - day) / 7);
    lines.push(`${cardDay(nextDay)} target (${formatCeleration(celeration)}/week): ${formatRate(target)}`);
    const next = correctFrequencies[recorded];
    if (next === undefined) return cardAttributes(lines);
    const hit = celeration >= 1 ? next >= target * (1 - 1e-9) : next <= target * (1 + 1e-9);
    lines.push(`${cardDay(nextDay)}: ${formatRate(next)} per minute — ${hit ? "Hit" : "Miss"}`);
    return cardAttributes(lines, hit ? "hit" : "miss");
  };
  const errorCard = ({ day, frequency }: Mark) =>
    cardAttributes([`${cardDay(day)} · Error`, `${formatRate(frequency)} per minute`, counted(errors, day)]);
  const floorCard = ({ day, frequency }: Mark) =>
    cardAttributes([
      `${cardDay(day)} · Record floor`,
      `${formatRate(frequency)} per minute`,
      `${formatTiming(timingSeconds[day] ?? 0)} timing`,
    ]);
  const aimCard = ({ day, frequency }: Mark) =>
    cardAttributes([`${cardDay(day)} · Aim`, `${formatRate(frequency)} per minute`]);
  // Points every day along a trend, for phase names to keep clear of.
  const trendPoints = (trend: Trend) =>
    Array.from({ length: Math.floor(trend.end - trend.start) + 1 }, (_, step) => ({
      x: x(trend.start + step),
      y: y(trend.from * trend.celeration ** (step / 7)),
    }));
  const aimPoints = spans.flatMap(({ phase, end }, index) => {
    const day = learning[index]?.aimDay ?? end;
    return phase.aim !== undefined && isPlottable(phase.aim) && day <= DAYS
      ? [{ x: x(day), y: y(phase.aim), day, frequency: phase.aim }]
      : [];
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

  const focus = currentPhaseBox(
    spans,
    [...correctPoints, ...errorPoints],
    floorPoints,
    aimPoints,
    learning.flatMap((line) => (line ? [{ x: x(line.end), y: y(line.to) }] : [])),
    x,
  );
  // Grid and marks sit in their own viewport, which enableZoom zooms and pans.
  const plot = [-PLOT_PADDING, -PLOT_PADDING, width + 2 * PLOT_PADDING, zeroY + 2 * PLOT_PADDING].map(round);
  const focusAttribute = focus ? ` data-focus="${[focus.left, focus.top, focus.right - focus.left, focus.bottom - focus.top].map(round).join(" ")}"` : "";
  const totalWidth = width + MARGIN.left + MARGIN.right;
  const totalHeight = zeroY + MARGIN.top + MARGIN.bottom;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(totalWidth)} ${round(totalHeight)}" style="display: block; width: 100%; height: auto">`,
    `<style>${STYLE}</style>`,
    `<g transform="translate(${MARGIN.left} ${MARGIN.top})">`,
    `<svg class="plot" x="${plot[0]}" y="${plot[1]}" width="${plot[2]}" height="${plot[3]}" viewBox="${plot.join(" ")}"${focusAttribute}>`,
    // Unpainted, but catches the pointer between the lines so a drag can start anywhere.
    `<rect class="plot-area" x="${plot[0]}" y="${plot[1]}" width="${plot[2]}" height="${plot[3]}"/>`,
    ...Object.entries(grid).map(([cls, lines]) => `<path class="grid ${cls}" d="${lines.join("")}"/>`),
    ...phaseLines,
    ...learning.flatMap((line) =>
      line && line.end > line.start ? [trendPath(line, "learning", "Learning line")] : [],
    ),
    ...correctFits.map((fit) => trendPath(fit, "fit correct-fit", "Correct best fit")),
    ...errorFits.map((fit) => trendPath(fit, "fit error-fit", "Error best fit")),
    ...floorPoints.map((mark) => hoverable(mark, dash(mark), floorCard(mark))),
    ...aimPoints.map((mark) => hoverable(mark, star(mark), aimCard(mark), STAR_RADIUS)),
    ...correctPoints.map((mark) => hoverable(mark, dot(mark), correctCard(mark))),
    ...errorPoints.map((mark) => hoverable(mark, cross(mark), errorCard(mark))),
    ...phaseNames,
    `</svg>`,
    ...parts,
    zoomControl(width, zeroY + 15),
    `</g>`,
    `</svg>`,
  ].join("\n");
}

const STYLE = `
/* Strokes are in screen pixels, so lines stay hairlines however far the chart is scaled. */
.grid { fill: none; stroke: #4a9fd8; stroke-width: 1; vector-effect: non-scaling-stroke; }
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
.zoom { display: none; }
.zoomable .zoom { display: inline; }
.zoom-button { cursor: pointer; }
.zoom-button rect { fill: #fff; stroke: #4a9fd8; stroke-width: 1; vector-effect: non-scaling-stroke; }
.zoom-button path { stroke: #1f5f8b; stroke-width: 1.25; vector-effect: non-scaling-stroke; }
.zoom-button:hover rect, .zoom-button:focus-visible rect { fill: #e8f3fb; }
.zoom-button:focus { outline: none; }
.zoom-button:focus-visible rect { stroke: #1f5f8b; stroke-width: 2; }
.zoom-button.disabled { cursor: default; opacity: 0.35; }
.zoom-level { font-size: 5px; text-anchor: middle; }
.plot-area { fill: none; pointer-events: all; }
.plot.zoomed { cursor: grab; touch-action: none; user-select: none; }
.plot.dragging { cursor: grabbing; }
.hover-area { fill: none; stroke: none; pointer-events: all; }
.trend .hover-area { stroke-width: 8px; vector-effect: non-scaling-stroke; pointer-events: stroke; }
.trend:hover path:first-child { stroke-width: 2; }
.card { pointer-events: none; }
.card rect { fill: #fff; stroke: #1f5f8b; stroke-width: 1; vector-effect: non-scaling-stroke; }
.card text { font-size: 5px; fill: #111; }
.card .card-title { font-weight: 600; }
.card .hit { fill: #1b7f3b; font-weight: 600; }
.card .miss { fill: #d62828; font-weight: 600; }
.phase-name { font-size: ${PHASE_FONT_SIZE}px; text-anchor: middle; fill: #111; paint-order: stroke; stroke: #fff; stroke-width: 1.5px; stroke-linejoin: round; }
`;

interface Point {
  x: number;
  y: number;
}

/** A plotted count: where it is drawn, and its day and count per minute. */
interface Mark extends Point {
  day: number;
  frequency: number;
}

interface PhaseSpan {
  phase: Phase;
  /** First and last day of the phase. */
  start: number;
  end: number;
}

/**
 * The days of the chart each phase covers, checking that the phases run in
 * order. End days count from `offset` days into the chart, where the first
 * phase starts; the last phase runs to the end of the chart without one.
 */
function phaseSpans(phases: readonly Phase[], offset: number): PhaseSpan[] {
  let start = 0;
  return phases.map((phase, index) => {
    const isLast = index === phases.length - 1;
    const end = phase.endDay ?? DAYS - offset;
    if (!isLast && !(Number.isFinite(phase.endDay) && end >= start)) {
      throw new RangeError(
        `Phase "${phase.name}" needs an endDay on or after day ${start}, got ${phase.endDay}`,
      );
    }
    const span = { phase, start: start + offset, end: end + offset };
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
 * The part of the chart enableZoom zooms in on: the current phase, the one
 * holding the latest correct or error (the last phase if that is past its end
 * day), from its phase line to its last mark, aim or end of its learning line,
 * with room around them. Without phases it takes in every mark. Without any
 * corrects or errors there is nothing to zoom in on.
 */
function currentPhaseBox(
  spans: readonly PhaseSpan[],
  marks: readonly Point[],
  floors: readonly Point[],
  aims: readonly Point[],
  lineEnds: readonly Point[],
  x: (day: number) => number,
): Box | undefined {
  const latest = Math.max(...marks.map((mark) => mark.x));
  if (!Number.isFinite(latest)) return undefined;
  const span = spans.find(({ end }) => latest <= x(end + 0.5)) ?? spans.at(-1) ?? { start: 0, end: DAYS };
  const [left, right] = [x(Math.max(span.start - 0.5, 0)), x(Math.min(span.end + 0.5, DAYS))];
  const inside = [...marks, ...floors, ...aims, ...lineEnds].filter((point) => point.x >= left && point.x <= right);
  const xs = inside.map((point) => point.x);
  const ys = inside.map((point) => point.y);
  return {
    left: (spans.length > 0 ? left : Math.min(...xs)) - FOCUS_PADDING,
    right: Math.max(...xs) + FOCUS_PADDING,
    top: Math.min(...ys) - FOCUS_PADDING,
    bottom: Math.max(...ys) + FOCUS_PADDING,
  };
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

/** A count per minute to three significant figures, written like the axis labels. */
function formatRate(frequency: number): string {
  return frequency === 0 ? "0" : formatFrequency(Number(frequency.toPrecision(3)));
}

/** A timing's length: in minutes when it is whole minutes, otherwise in seconds. */
function formatTiming(seconds: number): string {
  if (seconds % 60 !== 0) return `${seconds} second`;
  return `${seconds / 60} minute`;
}

/** A celeration as the chart writes it: ×1.25 when rising, ÷1.25 when falling. */
function formatCeleration(celeration: number): string {
  return celeration >= 1
    ? `×${Number(celeration.toPrecision(3))}`
    : `÷${Number((1 / celeration).toPrecision(3))}`;
}

/**
 * The lines of a card for enableHover to show, and whether the last one is a
 * hit or a miss. Newlines are written as references so XML keeps them.
 */
function cardAttributes(lines: readonly string[], result?: "hit" | "miss"): string {
  const card = ` data-card="${escapeXml(lines.join("\n")).replace(/\n/g, "&#10;")}"`;
  return result ? `${card} data-result="${result}"` : card;
}

/** A mark with its card, over an unpainted circle that is easier to point at. */
function hoverable({ x: cx, y: cy }: Point, mark: string, card: string, radius = HOVER_RADIUS): string {
  return `<g class="mark"${card}>${mark}<circle class="hover-area" cx="${round(cx)}" cy="${round(cy)}" r="${radius}"/></g>`;
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

/** `name`, remembering what it gave for each day so it runs once per day. */
function perDay<T>(name: (day: number) => T): (day: number) => T {
  const named = new Map<number, T>();
  return (day) => {
    if (!named.has(day)) named.set(day, name(day));
    return named.get(day) as T;
  };
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

/**
 * Zoom out and zoom in buttons with the zoom level between them, ending at
 * `right` with their tops at `top`. Hidden until enableZoom makes them work.
 */
function zoomControl(right: number, top: number): string {
  const size = ZOOM_BUTTON;
  const levelWidth = 15;
  const button = (left: number, cls: string, label: string, glyph: string) => {
    const [cx, cy, arm] = [left + size / 2, top + size / 2, size / 4];
    const across = `M${round(cx - arm)} ${round(cy)}H${round(cx + arm)}`;
    const d = glyph === "+" ? `${across}M${round(cx)} ${round(cy - arm)}V${round(cy + arm)}` : across;
    return [
      `<g class="zoom-button ${cls}" role="button" tabindex="0" aria-label="${label}">`,
      `<rect x="${round(left)}" y="${round(top)}" width="${size}" height="${size}" rx="1.5"/>`,
      `<path d="${d}"/>`,
      `</g>`,
    ].join("");
  };
  const zoomInLeft = right - size;
  const zoomOutLeft = zoomInLeft - levelWidth - size;
  return [
    `<g class="zoom">`,
    button(zoomOutLeft, "zoom-out disabled", "Zoom out", "-"),
    text(zoomOutLeft + size + levelWidth / 2, top + size / 2 + 1.75, "1×", "zoom-level"),
    button(zoomInLeft, "zoom-in", "Zoom in", "+"),
    `</g>`,
  ].join("\n");
}

/** `data` records where an axis label's grid line is, for enableZoom to move it with the grid. */
function text(x: number, y: number, content: string, cls: string, data: { x?: number; y?: number } = {}): string {
  const attributes = Object.entries(data).map(([axis, at]) => ` data-${axis}="${round(at)}"`);
  return `<text class="${cls}"${attributes.join("")} x="${round(x)}" y="${round(y)}">${content}</text>`;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
