import { describe, expect, it } from "vitest";
import { DAY_WIDTH, chartHeight, renderChart } from "./render.js";
import { DAYS } from "./scale.js";

describe("chartHeight", () => {
  it("makes a x2 per week line rise at 34 degrees", () => {
    const width = 700;
    const weekWidth = (width / DAYS) * 7;
    const doublingHeight = (chartHeight(width) / 6) * Math.log10(2);
    const angle = (Math.atan(doublingHeight / weekWidth) * 180) / Math.PI;
    expect(angle).toBeCloseTo(34);
  });
});

describe("renderChart", () => {
  const svg = renderChart();

  it("returns an svg element", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("scales to its container instead of having a fixed size", () => {
    expect(svg).toMatch(/^<svg[^>]* viewBox="/);
    expect(svg).toContain("width: 100%;");
    expect(svg).toContain("height: auto");
    expect(svg).not.toMatch(/^<svg[^>]* width="/);
  });

  it("draws thin lines first, then thick horizontal lines, then thick vertical lines", () => {
    const order = [...svg.matchAll(/<line class="(\w+)/g)].map((match) => match[1]);
    const layer = (cls: string | undefined) =>
      ({ unit: 0, day: 1, decade: 2, half: 2, zero: 2, week: 3 })[cls ?? ""];
    const layers = order.map(layer);
    expect(layers).toEqual([...layers].sort());
    expect(new Set(layers)).toEqual(new Set([0, 1, 2, 3]));
  });

  it("draws a line for every day and a heavier one every week", () => {
    expect(svg.match(/class="(day|week)"/g)).toHaveLength(DAYS + 1);
    expect(svg.match(/class="week"/g)).toHaveLength(DAYS / 7 + 1);
  });

  it("spaces the day lines DAY_WIDTH apart", () => {
    const xs = [...svg.matchAll(/class="(?:day|week)" x1="([\d.]+)"/g)]
      .map((match) => Number(match[1]))
      .sort((a, b) => a - b);
    expect(xs).toEqual(Array.from({ length: DAYS + 1 }, (_, day) => day * DAY_WIDTH));
  });

  it("labels each decade from .001 to 1000", () => {
    for (const label of [".001", ".01", ".1", "1", "10", "100", "1000"]) {
      expect(svg).toContain(`>${label}</text>`);
    }
  });

  describe("zero row", () => {
    const rowYs = (cls: string) =>
      [...svg.matchAll(new RegExp(`class="${cls}" x1="0" y1="([\\d.]+)"`, "g"))].map((match) => Number(match[1]));
    const columns = (cls: string) =>
      [...svg.matchAll(new RegExp(`class="${cls}" x1="[\\d.]+" y1="([\\d.]+)" x2="[\\d.]+" y2="([\\d.]+)"`, "g"))].map(
        (match) => ({ top: Number(match[1]), bottom: Number(match[2]) }),
      );
    const lowestDecade = Math.max(...rowYs("decade"));
    const zero = rowYs("zero")[0] ?? NaN;

    it("draws a zero line labelled 0 below .001", () => {
      expect(zero).toBeGreaterThan(lowestDecade);
      expect(svg).toContain(">0</text>");
    });

    it("stops the day lines a little below .001, leaving a gap above zero", () => {
      for (const { bottom } of columns("day")) {
        expect(bottom).toBeGreaterThan(lowestDecade);
        expect(bottom).toBeLessThan(zero);
      }
    });

    it("runs the week lines further down than the day lines", () => {
      const dayBottom = Math.max(...columns("day").map((column) => column.bottom));
      for (const { bottom } of columns("week")) {
        expect(bottom).toBeGreaterThan(dayBottom);
        expect(bottom).toBeLessThan(zero);
      }
    });

    it("gives every day a nub rising from the zero line", () => {
      const nubs = [...columns("day nub"), ...columns("week nub")];
      expect(nubs).toHaveLength(DAYS + 1);
      for (const { top, bottom } of nubs) {
        expect(bottom).toBe(zero);
        expect(top).toBeGreaterThan(Math.max(...columns("week").map((column) => column.bottom)));
      }
    });
  });

  it("labels the 5 line within each decade from .005 to 500", () => {
    for (const label of [".005", ".05", ".5", "5", "50", "500"]) {
      expect(svg).toContain(`>${label}</text>`);
    }
  });
});
