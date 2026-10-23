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

describe("renderChart corrects", () => {
  const dotsIn = (svg: string) =>
    [...svg.matchAll(/<circle class="correct" cx="([\d.]+)" cy="([\d.]+)"/g)].map((match) => ({
      cx: Number(match[1]),
      cy: Number(match[2]),
    }));
  const labelY = (svg: string, label: string) => Number(svg.match(new RegExp(`y="([\\d.]+)">${label}</text>`))?.[1]);

  it("draws no dots without data", () => {
    expect(dotsIn(renderChart())).toEqual([]);
  });

  it("draws a dot for each day at its frequency", () => {
    const svg = renderChart({ corrects: [1, 10], timingSeconds: [60, 60] });
    const [first, second] = dotsIn(svg);
    expect(first?.cx).toBe(0);
    expect(second?.cx).toBe(DAY_WIDTH);
    // Labels sit 2 units below their line.
    expect(first?.cy).toBeCloseTo(labelY(svg, "1") - 2);
    expect(second?.cy).toBeCloseTo(labelY(svg, "10") - 2);
  });

  it("skips days with a negative value", () => {
    const svg = renderChart({ corrects: [5, -1, 5], timingSeconds: [60, 60, 60] });
    expect(dotsIn(svg).map((dot) => dot.cx)).toEqual([0, 2 * DAY_WIDTH]);
  });

  it("draws zero just under the record floor", () => {
    const svg = renderChart({ corrects: [0, 0], timingSeconds: [60, 600] });
    const [first, second] = dotsIn(svg);
    expect(first?.cx).toBe(0);
    expect(first?.cy).toBeGreaterThan(labelY(svg, "1") - 2);
    expect(first?.cy).toBeLessThan(labelY(svg, "1") - 2 + 2.5);
    expect(second?.cx).toBe(DAY_WIDTH);
    expect(second?.cy).toBeGreaterThan(labelY(svg, ".1") - 2);
    expect(second?.cy).toBeLessThan(labelY(svg, ".1") - 2 + 2.5);
  });

  it("skips zero when its record floor is off the chart", () => {
    const svg = renderChart({ corrects: [0], timingSeconds: [2000 * 60] });
    expect(dotsIn(svg)).toEqual([]);
  });

  it("divides each count by its day's timing", () => {
    const svg = renderChart({ corrects: [5, 100], timingSeconds: [30, 600] });
    const [first, second] = dotsIn(svg);
    expect(first?.cy).toBeCloseTo(labelY(svg, "10") - 2);
    expect(second?.cy).toBeCloseTo(labelY(svg, "10") - 2);
  });

  it("skips days without a timing", () => {
    const svg = renderChart({ corrects: [5, 5, 5], timingSeconds: [0, -1] });
    expect(dotsIn(svg)).toEqual([]);
  });

  it("skips frequencies off the chart and days past the last day", () => {
    // 1 in 2000 minutes is below .001; 1001 in a minute is above 1000.
    const corrects = [1, 1001, ...Array<number>(DAYS - 1).fill(-1), 5];
    const timingSeconds = [2000 * 60, ...Array<number>(DAYS + 1).fill(60)];
    expect(dotsIn(renderChart({ corrects, timingSeconds }))).toEqual([]);
  });

  it("draws the dots over the grid", () => {
    const svg = renderChart({ corrects: [1], timingSeconds: [60] });
    expect(svg.indexOf("<circle")).toBeGreaterThan(svg.lastIndexOf("<line"));
  });
});

describe("renderChart errors", () => {
  const crossesIn = (svg: string) =>
    [...svg.matchAll(/<path class="error" d="M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/g)].map((match) => ({
      cx: (Number(match[1]) + Number(match[3])) / 2,
      cy: (Number(match[2]) + Number(match[4])) / 2,
    }));
  const labelY = (svg: string, label: string) => Number(svg.match(new RegExp(`y="([\\d.]+)">${label}</text>`))?.[1]);

  it("draws an X for each day at its frequency", () => {
    const svg = renderChart({ errors: [1, 10], timingSeconds: [60, 60] });
    const [first, second] = crossesIn(svg);
    expect(first?.cx).toBeCloseTo(0);
    expect(second?.cx).toBeCloseTo(DAY_WIDTH);
    expect(first?.cy).toBeCloseTo(labelY(svg, "1") - 2);
    expect(second?.cy).toBeCloseTo(labelY(svg, "10") - 2);
  });

  it("skips negative days, draws zero under the record floor and skips off-chart values", () => {
    const svg = renderChart({ errors: [0, -1, 1, 1001], timingSeconds: [60, 60, 2000 * 60, 60] });
    const crosses = crossesIn(svg);
    expect(crosses).toHaveLength(1);
    expect(crosses[0]?.cx).toBeCloseTo(0);
    expect(crosses[0]?.cy).toBeGreaterThan(labelY(svg, "1") - 2);
    expect(crosses[0]?.cy).toBeLessThan(labelY(svg, "1") - 2 + 2.5);
  });

  it("draws a zero correct and a zero error side by side under the record floor", () => {
    const svg = renderChart({ corrects: [0], errors: [0], timingSeconds: [60] });
    const dot = svg.match(/<circle class="correct" cx="(-?[\d.]+)" cy="([\d.]+)" r="([\d.]+)"/);
    const [cross] = crossesIn(svg);
    const [dotX, dotY, radius] = [Number(dot?.[1]), Number(dot?.[2]), Number(dot?.[3])];
    expect(dotY).toBeCloseTo(cross?.cy ?? NaN);
    expect(dotX).toBeLessThan(0);
    expect(cross?.cx).toBeGreaterThan(0);
    // The X's left edge is the cross half-width left of its centre.
    expect(dotX + radius).toBeLessThanOrEqual((cross?.cx ?? NaN) - radius);
    expect(dotY).toBeGreaterThan(labelY(svg, "1") - 2);
  });

  it("keeps a zero centred on its day when the other count is not zero", () => {
    const svg = renderChart({ corrects: [5, 0], errors: [0, 2], timingSeconds: [60, 60] });
    expect(crossesIn(svg)[0]?.cx).toBeCloseTo(0);
    expect(svg).toContain(`<circle class="correct" cx="${DAY_WIDTH}"`);
  });

  it("draws errors alongside corrects without changing them", () => {
    const svg = renderChart({ corrects: [20], errors: [2], timingSeconds: [60] });
    expect(svg.match(/<circle class="correct"/g)).toHaveLength(1);
    expect(crossesIn(svg)).toHaveLength(1);
  });

  it("draws the crosses over the grid", () => {
    const svg = renderChart({ errors: [1], timingSeconds: [60] });
    expect(svg.indexOf('<path class="error"')).toBeGreaterThan(svg.lastIndexOf("<line"));
  });
});

describe("renderChart record floors", () => {
  const dashesIn = (svg: string) =>
    [...svg.matchAll(/<path class="floor" d="M(-?[\d.]+) (-?[\d.]+)H(-?[\d.]+)"/g)].map((match) => ({
      cx: (Number(match[1]) + Number(match[3])) / 2,
      cy: Number(match[2]),
    }));
  const labelY = (svg: string, label: string) => Number(svg.match(new RegExp(`y="([\\d.]+)">${label}</text>`))?.[1]);

  it("draws no dashes without data", () => {
    expect(dashesIn(renderChart())).toEqual([]);
  });

  it("draws a dash for each day at one count per timing", () => {
    const svg = renderChart({ timingSeconds: [60, 600] });
    const [first, second] = dashesIn(svg);
    expect(first?.cx).toBeCloseTo(0);
    expect(second?.cx).toBeCloseTo(DAY_WIDTH);
    expect(first?.cy).toBeCloseTo(labelY(svg, "1") - 2);
    expect(second?.cy).toBeCloseTo(labelY(svg, ".1") - 2);
  });

  it("converts seconds to a per-minute floor", () => {
    const svg = renderChart({ timingSeconds: [30, 120] });
    const [first, second] = dashesIn(svg);
    // 30 seconds floors at 2 per minute, log10(2) of a cycle above the 1 line.
    expect(first?.cy).toBeCloseTo(labelY(svg, "1") - 2 - (labelY(svg, "1") - labelY(svg, "10")) * Math.log10(2));
    expect(second?.cy).toBeCloseTo(labelY(svg, ".5") - 1.5);
  });

  it("skips negative and zero timings and floors off the chart", () => {
    // 2000 minutes floors below .001; .03 seconds floors above 1000.
    const svg = renderChart({ timingSeconds: [-1, 0, 2000 * 60, 0.03, 60] });
    expect(dashesIn(svg)).toEqual([{ cx: 4 * DAY_WIDTH, cy: dashesIn(renderChart({ timingSeconds: [60] }))[0]?.cy }]);
  });

  it("draws the dashes over the grid and under the dots and crosses", () => {
    const svg = renderChart({ corrects: [1], errors: [1], timingSeconds: [60] });
    const floor = svg.indexOf('<path class="floor"');
    expect(floor).toBeGreaterThan(svg.lastIndexOf("<line"));
    expect(floor).toBeLessThan(svg.indexOf("<circle"));
    expect(floor).toBeLessThan(svg.indexOf('<path class="error"'));
  });
});

describe("renderChart phases", () => {
  const phaseLinesIn = (svg: string) =>
    [...svg.matchAll(/<path class="phase" d="M([\d.]+) ([\d.]+)V([\d.]+)"/g)].map((match) => ({
      x: Number(match[1]),
      top: Number(match[2]),
      bottom: Number(match[3]),
    }));
  const namesIn = (svg: string) =>
    [...svg.matchAll(/<text class="phase-name" x="([\d.]+)" y="([\d.]+)">([^<]*)<\/text>/g)].map((match) => ({
      x: Number(match[1]),
      y: Number(match[2]),
      name: match[3],
    }));
  const starsIn = (svg: string) =>
    [...svg.matchAll(/<path class="aim" d="M([\d.]+) ([\d.]+)L/g)].map((match) => ({
      // The path starts at the top point, STAR_RADIUS above the centre.
      x: Number(match[1]),
      y: Number(match[2]) + 3,
    }));
  const labelY = (svg: string, label: string) => Number(svg.match(new RegExp(`y="([\\d.]+)">${label}</text>`))?.[1]);
  const zeroY = (svg: string) => Number(svg.match(/class="zero" x1="0" y1="([\d.]+)"/)?.[1]);

  it("draws no phase line for a single phase, even with an end day", () => {
    expect(phaseLinesIn(renderChart({ phases: [{ name: "Baseline", endDay: 10 }] }))).toEqual([]);
  });

  it("draws a line between each phase and the next, from the top of the chart to the zero line", () => {
    const svg = renderChart({
      phases: [{ name: "Baseline", endDay: 6 }, { name: "Practice", endDay: 20 }, { name: "Review" }],
    });
    const lines = phaseLinesIn(svg);
    expect(lines.map((line) => line.x)).toEqual([6.5 * DAY_WIDTH, 20.5 * DAY_WIDTH]);
    for (const line of lines) {
      expect(line.top).toBe(0);
      expect(line.bottom).toBe(zeroY(svg));
    }
  });

  it("draws the phase lines over the grid and under the marks", () => {
    const svg = renderChart({ corrects: [1], timingSeconds: [60], phases: [{ name: "A", endDay: 0 }, { name: "B" }] });
    const phase = svg.indexOf('<path class="phase"');
    expect(phase).toBeGreaterThan(svg.lastIndexOf("<line"));
    expect(phase).toBeLessThan(svg.indexOf("<circle"));
  });

  it("skips a phase line past the last day", () => {
    const svg = renderChart({ phases: [{ name: "A", endDay: DAYS }, { name: "B" }] });
    expect(phaseLinesIn(svg)).toEqual([]);
  });

  it("throws when a phase before the last has no end day or ends before it starts", () => {
    expect(() => renderChart({ phases: [{ name: "A" }, { name: "B" }] })).toThrow(RangeError);
    expect(() =>
      renderChart({ phases: [{ name: "A", endDay: 10 }, { name: "B", endDay: 5 }, { name: "C" }] }),
    ).toThrow(RangeError);
  });

  it("writes each name just under the top of the chart, centred over its phase", () => {
    const svg = renderChart({ phases: [{ name: "Baseline", endDay: 13 }, { name: "Practice" }] });
    const [first, second] = namesIn(svg);
    expect(first?.name).toBe("Baseline");
    // The first phase runs from the edge of the chart to its phase line at 13.5.
    expect(first?.x).toBeCloseTo(6.75 * DAY_WIDTH);
    expect(second?.x).toBeCloseTo(((13.5 + DAYS) / 2) * DAY_WIDTH);
    for (const name of [first, second]) {
      expect(name?.y).toBeGreaterThan(0);
      expect(name?.y).toBeLessThan(10);
    }
  });

  it("escapes names", () => {
    expect(renderChart({ phases: [{ name: "Say <b> & \"hi\"" }] })).toContain(
      ">Say &#60;b&#62; &#38; &#34;hi&#34;</text>",
    );
  });

  it("keeps a name inside the chart when its phase is at the edge", () => {
    const [name] = namesIn(renderChart({ phases: [{ name: "A long phase name", endDay: 0 }, { name: "B" }] }));
    expect(name?.x).toBeGreaterThan(0.6 * 5 * "A long phase name".length * 0.5);
  });

  it("moves a name down to clear a mark at the top of the chart", () => {
    const clear = namesIn(renderChart({ phases: [{ name: "Fluency" }] }))[0];
    const corrects = Array<number>(DAYS + 1).fill(1000);
    const timingSeconds = Array<number>(DAYS + 1).fill(60);
    const svg = renderChart({ corrects, timingSeconds, phases: [{ name: "Fluency" }] });
    const [moved] = namesIn(svg);
    expect(moved?.y).toBeGreaterThan(clear?.y ?? NaN);
    expect(moved?.y).toBeLessThan(labelY(svg, "500"));
  });

  it("stacks names of narrow phases instead of overlapping them", () => {
    const [first, second] = namesIn(
      renderChart({ phases: [{ name: "Warm up", endDay: 1 }, { name: "Cool down", endDay: 3 }, { name: "Rest" }] }),
    );
    expect(Math.abs((first?.y ?? NaN) - (second?.y ?? NaN))).toBeGreaterThanOrEqual(5);
  });

  it("draws the aim as a star on the phase's last day", () => {
    const svg = renderChart({ phases: [{ name: "A", endDay: 10, aim: 10 }, { name: "B", aim: 100 }] });
    const [first, second] = starsIn(svg);
    expect(first?.x).toBeCloseTo(10 * DAY_WIDTH);
    expect(first?.y).toBeCloseTo(labelY(svg, "10") - 2);
    expect(second?.x).toBeCloseTo(DAYS * DAY_WIDTH);
    expect(second?.y).toBeCloseTo(labelY(svg, "100") - 2);
  });

  it("places the last phase's star on its end day when it has one", () => {
    const [star] = starsIn(renderChart({ phases: [{ name: "A", endDay: 30, aim: 10 }] }));
    expect(star?.x).toBeCloseTo(30 * DAY_WIDTH);
  });

  it("skips aims off the chart", () => {
    const svg = renderChart({ phases: [{ name: "A", endDay: 10, aim: 2000 }, { name: "B", aim: 0 }] });
    expect(starsIn(svg)).toEqual([]);
  });
});
