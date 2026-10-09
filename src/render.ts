import { DAYS, dayScale, frequencyScale } from "./scale.js";

/** Angle at which a ×2 per week celeration line rises on a standard chart. */
const CELERATION_ANGLE = 34;
/** Powers of ten from MIN_FREQUENCY (10^-3) up to MAX_FREQUENCY (10^3). */
const LOWEST_POWER = -3;
const HIGHEST_POWER = 3;

const MARGIN = { top: 30, right: 30, bottom: 60, left: 80 };

export interface ChartOptions {
  /**
   * Width of the grid in pixels. The height is derived from it so that a
   * ×2 per week line keeps the standard 34° angle.
   */
  width?: number;
}

/** Grid height that keeps the standard celeration angle for a given width. */
export function chartHeight(width: number): number {
  const weekWidth = (width / DAYS) * 7;
  const doublingHeight = weekWidth * Math.tan((CELERATION_ANGLE * Math.PI) / 180);
  const cycles = HIGHEST_POWER - LOWEST_POWER;
  return (doublingHeight / Math.log10(2)) * cycles;
}

/** Renders an empty daily per-minute Standard Celeration Chart as an SVG string. */
export function renderChart({ width = 900 }: ChartOptions = {}): string {
  const height = chartHeight(width);
  const x = dayScale({ left: 0, right: width });
  const y = frequencyScale({ top: 0, bottom: height });
  const parts: string[] = [];

  for (let day = 0; day <= DAYS; day++) {
    parts.push(line(x(day), 0, x(day), height, day % 7 === 0 ? "week" : "day"));
  }
  for (let day = 0; day <= DAYS; day += 14) {
    parts.push(text(x(day), height + 20, String(day), "x-label"));
  }

  for (let power = LOWEST_POWER; power <= HIGHEST_POWER; power++) {
    const decade = 10 ** power;
    parts.push(line(0, y(decade), width, y(decade), "decade"));
    parts.push(text(-10, y(decade) + 4, formatFrequency(decade), "y-label"));
    if (power === HIGHEST_POWER) break;
    for (let n = 2; n <= 9; n++) {
      parts.push(line(0, y(n * decade), width, y(n * decade), n === 5 ? "half" : "unit"));
    }
  }

  parts.push(text(width / 2, height + 45, "Successive calendar days", "title"));
  parts.push(
    `<text class="title" transform="translate(-60 ${round(height / 2)}) rotate(-90)">Count per minute</text>`,
  );

  const totalWidth = width + MARGIN.left + MARGIN.right;
  const totalHeight = height + MARGIN.top + MARGIN.bottom;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(totalWidth)} ${round(totalHeight)}" width="${round(totalWidth)}" height="${round(totalHeight)}">`,
    `<style>${STYLE}</style>`,
    `<g transform="translate(${MARGIN.left} ${MARGIN.top})">`,
    ...parts,
    `</g>`,
    `</svg>`,
  ].join("\n");
}

const STYLE = `
line { stroke: #4a9fd8; shape-rendering: crispEdges; }
.day, .unit { stroke-width: 0.5; opacity: 0.5; }
.half { stroke-width: 0.75; opacity: 0.8; }
.week, .decade { stroke-width: 1.25; }
text { font-family: system-ui, sans-serif; fill: #1f5f8b; }
.x-label { font-size: 11px; text-anchor: middle; }
.y-label { font-size: 11px; text-anchor: end; }
.title { font-size: 13px; text-anchor: middle; }
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
