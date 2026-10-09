import { DAYS, dayScale, frequencyScale } from "./scale.js";

/** Angle at which a ×2 per week celeration line rises on a standard chart. */
const CELERATION_ANGLE = 34;
/** Powers of ten from MIN_FREQUENCY (10^-3) up to MAX_FREQUENCY (10^3). */
const LOWEST_POWER = -3;
const HIGHEST_POWER = 3;

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

/**
 * Renders an empty daily per-minute Standard Celeration Chart as an SVG string.
 * The SVG fills the width of its container and keeps its proportions.
 */
export function renderChart(): string {
  const width = DAYS * DAY_WIDTH;
  const height = chartHeight(width);
  const x = dayScale({ left: 0, right: width });
  const y = frequencyScale({ top: 0, bottom: height });
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

  for (let day = 0; day <= DAYS; day++) {
    if (day % 7 === 0) {
      thickColumns.push(line(x(day), 0, x(day), height, "week"));
    } else {
      thinColumns.push(line(x(day), 0, x(day), height, "day"));
    }
  }
  for (let day = 0; day <= DAYS; day += 14) {
    parts.push(text(x(day), height + 9, String(day), "x-label"));
  }

  parts.push(text(width / 2, height + 21, "Successive calendar days", "title"));
  parts.push(
    `<text class="title" transform="translate(-28 ${round(height / 2)}) rotate(-90)">Count per minute</text>`,
  );

  const totalWidth = width + MARGIN.left + MARGIN.right;
  const totalHeight = height + MARGIN.top + MARGIN.bottom;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(totalWidth)} ${round(totalHeight)}" style="display: block; width: 100%; height: auto">`,
    `<style>${STYLE}</style>`,
    `<g transform="translate(${MARGIN.left} ${MARGIN.top})">`,
    ...thinRows,
    ...thinColumns,
    ...thickRows,
    ...thickColumns,
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
.week, .decade { stroke-width: 2; }
text { font-family: system-ui, sans-serif; fill: #1f5f8b; }
.x-label { font-size: 5.5px; text-anchor: middle; }
.y-label { font-size: 5.5px; text-anchor: end; }
.half-label { font-size: 4.5px; opacity: 0.8; }
.title { font-size: 6.5px; text-anchor: middle; }
`;

function formatFrequency(frequency: number): string {
  return frequency < 1 ? String(frequency).replace(/^0/, "") : String(frequency);
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
