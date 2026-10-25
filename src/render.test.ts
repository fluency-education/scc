import { describe, expect, it } from "vitest";
import { type ChartOptions, DAY_WIDTH, chartHeight, renderChart } from "./render.js";
import { DAYS } from "./scale.js";

/** The ends of each line in a chart's grid path of class `cls`, such as "day" or "week nub". */
const gridLines = (svg: string, cls: string) => {
  const d = svg.match(new RegExp(`<path class="grid ${cls}" d="([^"]*)"`))?.[1] ?? "";
  return [...d.matchAll(/M(-?[\d.]+) (-?[\d.]+)([HV])(-?[\d.]+)/g)].map(([, x1, y1, direction, to]) => ({
    x1: Number(x1),
    y1: Number(y1),
    x2: Number(direction === "H" ? to : x1),
    y2: Number(direction === "V" ? to : y1),
  }));
};
/** Where the last grid path ends, for checking what is drawn over the grid. */
const gridEnd = (svg: string) => svg.lastIndexOf('<path class="grid');
/** renderChart with a 1 minute timing on each day with a count, and -1 on the days without. */
const timed = (options: ChartOptions) =>
  renderChart({ ...options, timingSeconds: (options.corrects ?? options.errors ?? []).map((count) => (count === -1 ? -1 : 60)) });

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
    const order = [...svg.matchAll(/<path class="grid (\w+)/g)].map((match) => match[1]);
    const layer = (cls: string | undefined) =>
      ({ unit: 0, day: 1, decade: 2, half: 2, zero: 2, week: 3 })[cls ?? ""];
    const layers = order.map(layer);
    expect(layers).toEqual([...layers].sort());
    expect(new Set(layers)).toEqual(new Set([0, 1, 2, 3]));
  });

  it("draws a line for every day and a heavier one every week", () => {
    expect(gridLines(svg, "day").length + gridLines(svg, "week").length).toBe(DAYS + 1);
    expect(gridLines(svg, "week")).toHaveLength(DAYS / 7 + 1);
  });

  it("spaces the day lines DAY_WIDTH apart", () => {
    const xs = [...gridLines(svg, "day"), ...gridLines(svg, "week")].map((line) => line.x1).sort((a, b) => a - b);
    expect(xs).toEqual(Array.from({ length: DAYS + 1 }, (_, day) => day * DAY_WIDTH));
  });

  it("labels each decade from .001 to 1000", () => {
    for (const label of [".001", ".01", ".1", "1", "10", "100", "1000"]) {
      expect(svg).toContain(`>${label}</text>`);
    }
  });

  describe("zero row", () => {
    const rowYs = (cls: string) => gridLines(svg, cls).map((line) => line.y1);
    const columns = (cls: string) => gridLines(svg, cls).map((line) => ({ top: line.y1, bottom: line.y2 }));
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

  it("skips days with nothing recorded", () => {
    const svg = renderChart({ corrects: [5, -1, 5], timingSeconds: [60, -1, 60] });
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

  it("divides each count by its day's timing", () => {
    const svg = renderChart({ corrects: [5, 100], timingSeconds: [30, 600] });
    const [first, second] = dotsIn(svg);
    expect(first?.cy).toBeCloseTo(labelY(svg, "10") - 2);
    expect(second?.cy).toBeCloseTo(labelY(svg, "10") - 2);
  });

  it("draws the dots over the grid", () => {
    const svg = renderChart({ corrects: [1], timingSeconds: [60] });
    expect(svg.indexOf("<circle")).toBeGreaterThan(gridEnd(svg));
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

  it("skips days with nothing recorded and draws zero under the record floor", () => {
    const svg = renderChart({ errors: [0, -1], timingSeconds: [60, -1] });
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
    expect(svg.indexOf('<path class="error"')).toBeGreaterThan(gridEnd(svg));
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

  it("skips days without a timing", () => {
    const svg = renderChart({ timingSeconds: [-1, 60] });
    expect(dashesIn(svg)).toEqual([{ cx: DAY_WIDTH, cy: dashesIn(renderChart({ timingSeconds: [60] }))[0]?.cy }]);
  });

  it("draws the dashes over the grid and under the dots and crosses", () => {
    const svg = renderChart({ corrects: [1], errors: [1], timingSeconds: [60] });
    const floor = svg.indexOf('<path class="floor"');
    expect(floor).toBeGreaterThan(gridEnd(svg));
    expect(floor).toBeLessThan(svg.indexOf("<circle"));
    expect(floor).toBeLessThan(svg.indexOf('<path class="error"'));
  });
});

describe("renderChart phases", () => {
  const phaseLinesIn = (svg: string) =>
    [...svg.matchAll(/<path class="phase" d="M([\d.]+) ([\d.]+)V([\d.]+)M[\d.]+ ([\d.]+)V([\d.]+)"/g)].map(
      (match) => ({
        x: Number(match[1]),
        top: Number(match[2]),
        tail: Number(match[3]),
        nub: Number(match[4]),
        bottom: Number(match[5]),
      }),
    );
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
  const zeroY = (svg: string) => gridLines(svg, "zero")[0]?.y1;

  it("draws no phase line for a single phase, even with an end day", () => {
    expect(phaseLinesIn(renderChart({ phases: [{ name: "Baseline", endDay: 10 }] }))).toEqual([]);
  });

  it("draws a line between each phase and the next, from the top of the chart to the zero line, with the week lines' gap", () => {
    const svg = renderChart({
      phases: [{ name: "Baseline", endDay: 6 }, { name: "Practice", endDay: 20 }, { name: "Review" }],
    });
    const lines = phaseLinesIn(svg);
    const column = (cls: string) => {
      const line = gridLines(svg, cls).find(({ x1 }) => x1 === 0);
      return { top: line?.y1, bottom: line?.y2 };
    };
    const [weekLine, weekNub] = [column("week"), column("week nub")];
    expect(lines.map((line) => line.x)).toEqual([6.5 * DAY_WIDTH, 20.5 * DAY_WIDTH]);
    for (const line of lines) {
      expect(line.top).toBe(0);
      expect(line.tail).toBe(weekLine?.bottom);
      expect(line.nub).toBe(weekNub?.top);
      expect(line.bottom).toBe(zeroY(svg));
    }
  });

  it("draws the phase lines over the grid and under the marks", () => {
    const svg = renderChart({ corrects: [1], timingSeconds: [60], phases: [{ name: "A", endDay: 0 }, { name: "B" }] });
    const phase = svg.indexOf('<path class="phase"');
    expect(phase).toBeGreaterThan(gridEnd(svg));
    expect(phase).toBeLessThan(svg.indexOf("<circle"));
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

});

describe("renderChart learning lines", () => {
  const linesIn = (svg: string) =>
    [...svg.matchAll(/<path class="learning" d="M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)"/g)].map((match) => ({
      x1: Number(match[1]),
      y1: Number(match[2]),
      x2: Number(match[3]),
      y2: Number(match[4]),
    }));
  const starsIn = (svg: string) =>
    [...svg.matchAll(/<path class="aim" d="M([\d.]+) ([\d.]+)L/g)].map((match) => ({
      x: Number(match[1]),
      y: Number(match[2]) + 3,
    }));
  const labelY = (svg: string, label: string) => Number(svg.match(new RegExp(`y="([\\d.]+)">${label}</text>`))?.[1]);

  it("runs from the first correct at the celeration until it reaches the aim", () => {
    // ×2 a week from 10 reaches 40 in two weeks.
    const svg = timed({ corrects: [-1, 10, 12], phases: [{ name: "A", aim: 40, celeration: 2 }] });
    const [line] = linesIn(svg);
    const [star] = starsIn(svg);
    expect(line?.x1).toBeCloseTo(DAY_WIDTH);
    expect(line?.y1).toBeCloseTo(labelY(svg, "10") - 2);
    expect(line?.x2).toBeCloseTo(15 * DAY_WIDTH);
    expect(star?.x).toBeCloseTo(15 * DAY_WIDTH);
    expect(line?.y2).toBeCloseTo(star?.y ?? NaN, 1);
  });

  it("puts the star on the next whole day when the aim is reached part way through one", () => {
    // ×2 a week from 10 reaches 30 after 7 × log2(3) ≈ 11.09 days, on day 12.09.
    const svg = timed({ corrects: [-1, 10], phases: [{ name: "A", aim: 30, celeration: 2 }] });
    const [line] = linesIn(svg);
    const [star] = starsIn(svg);
    expect(line?.x2).toBeCloseTo((1 + 7 * Math.log2(3)) * DAY_WIDTH, 1);
    expect(star?.x).toBeCloseTo(13 * DAY_WIDTH);
    expect(star?.y).toBeCloseTo(line?.y2 ?? NaN, 1);
  });

  it("falls when the celeration is below one", () => {
    const svg = timed({ corrects: [8], phases: [{ name: "A", aim: 2, celeration: 0.5 }] });
    const [line] = linesIn(svg);
    expect(line?.x2).toBeCloseTo(14 * DAY_WIDTH);
    expect(line?.y2).toBeGreaterThan(line?.y1 ?? NaN);
    expect(starsIn(svg)[0]?.x).toBeCloseTo(14 * DAY_WIDTH);
  });

  it("starts each phase's line at that phase's first correct above zero", () => {
    const corrects = [5, -1, -1, -1, -1, -1, -1, 0, -1, 10];
    const svg = timed({
      corrects,
      phases: [{ name: "A", endDay: 6 }, { name: "B", aim: 20, celeration: 2 }],
    });
    const lines = linesIn(svg);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.x1).toBeCloseTo(9 * DAY_WIDTH);
    expect(lines[0]?.y1).toBeCloseTo(labelY(svg, "10") - 2);
  });

  it("runs to the end of the phase without an aim", () => {
    const svg = timed({
      corrects: [10],
      phases: [{ name: "A", endDay: 14, celeration: 2 }, { name: "B" }],
    });
    const [line] = linesIn(svg);
    expect(line?.x2).toBeCloseTo(14 * DAY_WIDTH);
    // Two weeks at ×2 is ×4, log10(4) of a cycle higher.
    expect((line?.y1 ?? NaN) - (line?.y2 ?? NaN)).toBeCloseTo((labelY(svg, "1") - labelY(svg, "10")) * Math.log10(4), 1);
  });

  it("runs to the end of the phase and keeps the star there when the line never reaches the aim", () => {
    const svg = timed({
      corrects: [10],
      phases: [{ name: "A", endDay: 20, aim: 5, celeration: 2 }, { name: "B" }],
    });
    expect(linesIn(svg)[0]?.x2).toBeCloseTo(20 * DAY_WIDTH);
    expect(starsIn(svg)[0]?.x).toBeCloseTo(20 * DAY_WIDTH);
  });

  it("stops at the top of the chart", () => {
    const svg = timed({ corrects: [500], phases: [{ name: "A", celeration: 2 }] });
    const [line] = linesIn(svg);
    expect(line?.x2).toBeCloseTo(7 * DAY_WIDTH);
    expect(line?.y2).toBeCloseTo(0);
  });

  it("is not drawn without a celeration or a correct in the phase", () => {
    expect(linesIn(timed({ corrects: [10], phases: [{ name: "A", aim: 20 }] }))).toEqual([]);
    const svg = timed({
      corrects: [10],
      phases: [{ name: "A", endDay: 0 }, { name: "B", endDay: 30, aim: 20, celeration: 2 }, { name: "C" }],
    });
    expect(linesIn(svg)).toEqual([]);
    expect(starsIn(svg)[0]?.x).toBeCloseTo(30 * DAY_WIDTH);
  });

  it("draws the line over the grid and under the marks", () => {
    const svg = timed({ corrects: [10], phases: [{ name: "A", aim: 20, celeration: 2 }] });
    const learning = svg.indexOf('<path class="learning"');
    expect(learning).toBeGreaterThan(gridEnd(svg));
    expect(learning).toBeLessThan(svg.indexOf('<path class="aim"'));
    expect(learning).toBeLessThan(svg.indexOf("<circle"));
  });
});

describe("renderChart best fit lines", () => {
  const fitsIn = (svg: string, kind: "correct" | "error") =>
    [...svg.matchAll(new RegExp(`<path class="fit ${kind}-fit" d="M([\\d.]+) ([\\d.]+)L([\\d.]+) ([\\d.]+)"`, "g"))].map(
      (match) => ({ x1: Number(match[1]), y1: Number(match[2]), x2: Number(match[3]), y2: Number(match[4]) }),
    );
  const labelY = (svg: string, label: string) => Number(svg.match(new RegExp(`y="([\\d.]+)">${label}</text>`))?.[1]);

  it("runs through counts on a straight celeration from the first to the last", () => {
    // ×2 a week, exactly on the line.
    const corrects = [-1, 10, -1, -1, -1, -1, -1, -1, 20, -1, -1, -1, -1, -1, -1, 40];
    const svg = timed({ corrects });
    const [fit] = fitsIn(svg, "correct");
    expect(fit?.x1).toBeCloseTo(DAY_WIDTH);
    expect(fit?.y1).toBeCloseTo(labelY(svg, "10") - 2, 1);
    expect(fit?.x2).toBeCloseTo(15 * DAY_WIDTH);
    expect(fit?.y2).toBeCloseTo(labelY(svg, "10") - 2 - (labelY(svg, "1") - labelY(svg, "10")) * Math.log10(4), 1);
  });

  it("fits the log of the counts by least squares", () => {
    // 1, 100, 1 averages to a flat line at 10^(2/3) per minute.
    const svg = timed({ corrects: [1, 100, 1] });
    const [fit] = fitsIn(svg, "correct");
    const expected = labelY(svg, "1") - 2 - (labelY(svg, "1") - labelY(svg, "10")) * (2 / 3);
    expect(fit?.y1).toBeCloseTo(expected, 1);
    expect(fit?.y2).toBeCloseTo(expected, 1);
  });

  it("draws a red line through the errors", () => {
    const svg = timed({ corrects: [5, 5], errors: [4, 2] });
    expect(fitsIn(svg, "correct")).toHaveLength(1);
    const [fit] = fitsIn(svg, "error");
    expect(fit?.y2).toBeLessThan(labelY(svg, "1"));
    expect(fit?.y2).toBeGreaterThan(fit?.y1 ?? NaN);
  });

  it("needs two days to fit", () => {
    expect(fitsIn(timed({ corrects: [5, -1] }), "correct")).toEqual([]);
  });

  it("counts a zero as half its record floor", () => {
    // Zeros in a 1 minute and a 10 minute timing count as .5 and .05.
    const svg = renderChart({ corrects: [0, 0], timingSeconds: [60, 600] });
    const [fit] = fitsIn(svg, "correct");
    const cycle = labelY(svg, "1") - labelY(svg, "10");
    expect(fit?.x1).toBeCloseTo(0);
    expect(fit?.x2).toBeCloseTo(DAY_WIDTH);
    expect(fit?.y1).toBeCloseTo(labelY(svg, "1") - 2 + cycle * Math.log10(2), 1);
    expect(fit?.y2).toBeCloseTo(labelY(svg, ".1") - 2 + cycle * Math.log10(2), 1);
  });

  it("pulls the line down for zero corrects and up for zero errors that would otherwise be left out", () => {
    const corrects = [10, 10, 10, 0];
    const errors = [0, 2, 2, 2];
    const svg = timed({ corrects, errors });
    const [correctFit] = fitsIn(svg, "correct");
    const [errorFit] = fitsIn(svg, "error");
    expect(correctFit?.x2).toBeCloseTo(3 * DAY_WIDTH);
    expect(correctFit?.y2).toBeGreaterThan(correctFit?.y1 ?? NaN);
    expect(errorFit?.x1).toBeCloseTo(0);
    expect(errorFit?.y2).toBeLessThan(errorFit?.y1 ?? NaN);
  });

  it("fits each phase on its own", () => {
    const svg = timed({
      corrects: [10, 10, 10, 40, 20],
      phases: [{ name: "A", endDay: 2 }, { name: "B", endDay: 3 }, { name: "C" }],
    });
    const fits = fitsIn(svg, "correct");
    // Phase B has one day, too few to fit.
    expect(fits.map((fit) => [fit.x1, fit.x2])).toEqual([[0, 2 * DAY_WIDTH]]);
  });

  it("stops at the top of the chart", () => {
    const svg = timed({ corrects: [100, 500, 1000, 1000] });
    const [fit] = fitsIn(svg, "correct");
    expect(fit?.y2).toBeCloseTo(0);
    expect(fit?.x2).toBeLessThan(3 * DAY_WIDTH);
  });

  it("draws the lines over the grid and under the marks", () => {
    const svg = timed({ corrects: [5, 6], errors: [1, 2] });
    const fit = svg.indexOf('<path class="fit');
    expect(fit).toBeGreaterThan(gridEnd(svg));
    expect(svg.lastIndexOf('<path class="fit')).toBeLessThan(svg.indexOf("<circle"));
  });
});

describe("renderChart zoom", () => {
  const svg = renderChart();

  it("draws the grid and marks in their own viewport, padded past the grid", () => {
    const plot = svg.match(/<svg class="plot" x="(-[\d.]+)" y="(-[\d.]+)" width="([\d.]+)" height="([\d.]+)" viewBox="([^"]+)">/);
    expect(plot).not.toBeNull();
    const [, x, y, width, height, viewBox] = plot ?? [];
    expect(viewBox).toBe(`${x} ${y} ${width} ${height}`);
    expect(Number(width)).toBeGreaterThan(DAYS * DAY_WIDTH);
    const inside = svg.slice(svg.indexOf('class="plot"'), svg.indexOf("</svg>"));
    expect(inside).toContain('class="grid week"');
    expect(inside).not.toContain("<text");
  });

  it("lays an unpainted area under the whole viewport for dragging to catch", () => {
    const plot = svg.match(/<svg class="plot" (x="[^"]+" y="[^"]+" width="[^"]+" height="[^"]+")[^>]*>\n<rect class="plot-area" ([^/]+)\/>/);
    expect(plot?.[2]).toBe(plot?.[1]);
    expect(svg).toContain(".plot-area { fill: none; pointer-events: all; }");
  });

  describe("focus", () => {
    const focusOf = (chart: string) => {
      const match = chart.match(/data-focus="([^"]+)"/);
      const [left = NaN, top = NaN, width = NaN, height = NaN] = match?.[1]?.split(" ").map(Number) ?? [];
      return match ? { left, top, right: left + width, bottom: top + height } : undefined;
    };
    const dots = (chart: string) =>
      [...chart.matchAll(/<circle class="correct" cx="([\d.]+)" cy="([\d.]+)"/g)].map((match) => ({
        x: Number(match[1]),
        y: Number(match[2]),
      }));

    it("has nothing to focus on without marks", () => {
      expect(focusOf(svg)).toBeUndefined();
    });

    it("takes in every mark without phases", () => {
      const chart = timed({ corrects: [10, -1, 20, 30] });
      const focus = focusOf(chart);
      for (const dot of dots(chart)) {
        expect(dot.x).toBeGreaterThan(focus?.left ?? NaN);
        expect(dot.x).toBeLessThan(focus?.right ?? NaN);
        expect(dot.y).toBeGreaterThan(focus?.top ?? NaN);
        expect(dot.y).toBeLessThan(focus?.bottom ?? NaN);
      }
      expect(focus?.left).toBeGreaterThan(-DAY_WIDTH * 3);
      expect(focus?.right).toBeLessThan(10 * DAY_WIDTH);
    });

    it("covers the phase holding the latest mark, from its phase line to its aim", () => {
      const chart = timed({
        corrects: Array.from({ length: 15 }, (_, day) => 5 + day),
        phases: [
          { name: "A", endDay: 9 },
          { name: "B", endDay: 12, aim: 500 },
        ],
      });
      const focus = focusOf(chart);
      const phaseX = Number(chart.match(/<path class="phase" d="M([\d.]+) /)?.[1]);
      const star = chart.match(/<path class="aim" d="M([\d.]+) ([\d.]+)/);
      expect(focus?.left).toBeLessThan(phaseX);
      expect(focus?.left).toBeGreaterThan(phaseX - 10);
      expect(focus?.right).toBeGreaterThan(Number(star?.[1]));
      expect(focus?.top).toBeLessThan(Number(star?.[2]));
    });
  });

  it("marks where each axis label's grid line is", () => {
    expect(svg).toMatch(/<text class="y-label" data-y="0" x="-4" y="2">1000<\/text>/);
    expect(svg).toMatch(/<text class="x-label" data-x="0" x="0" y="[\d.]+">0<\/text>/);
  });

  it("draws zoom buttons that stay hidden until enableZoom shows them", () => {
    expect(svg).toContain('aria-label="Zoom in"');
    expect(svg).toContain('aria-label="Zoom out"');
    expect(svg).toContain(">1×</text>");
    expect(svg).toContain(".zoom { display: none; }");
    expect(svg).toContain(".zoomable .zoom { display: inline; }");
  });
});

describe("renderChart cards", () => {
  const cards = (svg: string) =>
    [...svg.matchAll(/data-card="([^"]*)"(?: data-result="(\w+)")?/g)].map((match) => ({
      lines: (match[1] ?? "").split("&#10;"),
      result: match[2],
    }));
  const card = (svg: string, title: string) => cards(svg).find(({ lines }) => lines[0] === title);

  it("gives a correct its day, rate, count and timing, and the next day's target at its phase's celeration", () => {
    const svg = timed({
      corrects: [10, 12],
      phases: [{ name: "Practice", celeration: 1.25 }],
    });
    const target = 10 * 1.25 ** (1 / 7);
    expect(card(svg, "Day 0 · Correct")?.lines).toEqual([
      "Day 0 · Correct",
      "10 per minute",
      "10 in a 1 minute timing",
      `Day 1 target (×1.25/week): ${Number(target.toPrecision(3))}`,
      "Day 1: 12 per minute — Hit",
    ]);
    expect(card(svg, "Day 0 · Correct")?.result).toBe("hit");
  });

  it("aims for ×2 per week without a phase celeration, and marks a miss", () => {
    const svg = timed({ corrects: [10, 10] });
    const { lines, result } = card(svg, "Day 0 · Correct") ?? {};
    expect(lines?.[3]).toBe(`Day 1 target (×2/week): ${Number((10 * 2 ** (1 / 7)).toPrecision(3))}`);
    expect(lines?.[4]).toBe("Day 1: 10 per minute — Miss");
    expect(result).toBe("miss");
  });

  it("sets the target for the next recorded day, however far off", () => {
    const svg = timed({ corrects: [10, -1, -1, 20] });
    const { lines } = card(svg, "Day 0 · Correct") ?? {};
    expect(lines?.[3]).toBe(`Day 3 target (×2/week): ${Number((10 * 2 ** (3 / 7)).toPrecision(3))}`);
    expect(lines?.[4]).toBe("Day 3: 20 per minute — Hit");
  });

  it("counts staying under the target as a hit when the celeration falls", () => {
    const svg = timed({ corrects: [10, 8], phases: [{ name: "Fewer", celeration: 0.5 }] });
    expect(card(svg, "Day 0 · Correct")?.lines[3]).toContain("(÷2/week)");
    expect(card(svg, "Day 0 · Correct")?.result).toBe("hit");
  });

  it("gives only the target until the next day is recorded, and none from zero", () => {
    const svg = timed({ corrects: [0, 10] });
    expect(card(svg, "Day 0 · Correct")?.lines).toEqual(["Day 0 · Correct", "0 per minute", "0 in a 1 minute timing"]);
    const last = card(svg, "Day 1 · Correct");
    expect(last?.lines).toHaveLength(4);
    expect(last?.lines[3]).toMatch(/^Day 2 target/);
    expect(last?.result).toBeUndefined();
  });

  it("gives an error its day, rate, count and timing", () => {
    const svg = renderChart({ errors: [2, 0, 3], timingSeconds: [120, 60, 90] });
    expect(card(svg, "Day 0 · Error")?.lines).toEqual(["Day 0 · Error", "1 per minute", "2 in a 2 minute timing"]);
    expect(card(svg, "Day 1 · Error")?.lines).toEqual(["Day 1 · Error", "0 per minute", "0 in a 1 minute timing"]);
    expect(card(svg, "Day 2 · Error")?.lines[2]).toBe("3 in a 90 second timing");
  });

  it("gives each line its celeration per week", () => {
    // Whole counts in 10 minute timings, close enough to ×2 and ÷2 a week to round to them.
    const corrects = Array.from({ length: 15 }, (_, day) => Math.round(1000 * 2 ** (day / 7)));
    const errors = Array.from({ length: 15 }, (_, day) => Math.round(400 / 2 ** (day / 7)));
    const svg = renderChart({
      corrects,
      errors,
      timingSeconds: corrects.map(() => 600),
      phases: [{ name: "Practice", aim: 1000, celeration: 1.5 }],
    });
    expect(card(svg, "Learning line")?.lines).toEqual(["Learning line", "×1.5 per week"]);
    expect(card(svg, "Correct best fit")?.lines).toEqual(["Correct best fit", "×2 per week"]);
    expect(card(svg, "Error best fit")?.lines).toEqual(["Error best fit", "÷2 per week"]);
  });

  it("gives a record floor its day, rate and timing", () => {
    const svg = renderChart({ timingSeconds: [60, 90, 600] });
    expect(card(svg, "Day 0 · Record floor")?.lines).toEqual(["Day 0 · Record floor", "1 per minute", "1 minute timing"]);
    expect(card(svg, "Day 1 · Record floor")?.lines).toEqual([
      "Day 1 · Record floor",
      ".667 per minute",
      "90 second timing",
    ]);
    expect(card(svg, "Day 2 · Record floor")?.lines[2]).toBe("10 minute timing");
  });

  it("gives an aim star its day and rate", () => {
    const svg = renderChart({ phases: [{ name: "Practice", endDay: 20, aim: 40 }, { name: "Next" }] });
    expect(card(svg, "Day 20 · Aim")?.lines).toEqual(["Day 20 · Aim", "40 per minute"]);
  });

  it("puts an easier-to-point-at area with each mark and line", () => {
    const svg = timed({ corrects: [10, 12], errors: [1, 1] });
    expect(svg.match(/<g class="mark"[^>]*><circle class="correct"[^>]*\/><circle class="hover-area"/g)).toHaveLength(2);
    expect(svg.match(/<g class="mark"[^>]*><path class="error"[^>]*\/><circle class="hover-area"/g)).toHaveLength(2);
    expect(svg.match(/<g class="trend"[^>]*><path class="fit[^>]*\/><path class="hover-area"/g)).toHaveLength(2);
    expect(svg.match(/<g class="mark"[^>]*><path class="floor"[^>]*\/><circle class="hover-area"/g)).toHaveLength(2);
    const aimed = renderChart({ phases: [{ name: "Practice", aim: 40 }] });
    expect(aimed).toMatch(/<g class="mark"[^>]*><path class="aim"[^>]*\/><circle class="hover-area"[^>]* r="3"/);
  });
});

describe("renderChart dates", () => {
  const xLabels = (svg: string) => [...svg.matchAll(/class="x-label"[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]);

  it("numbers the days without a start date", () => {
    const svg = renderChart();
    expect(xLabels(svg)).toEqual(Array.from({ length: DAYS / 14 + 1 }, (_, index) => String(index * 14)));
    expect(svg).toContain(">Successive calendar days</text>");
  });

  it("dates the days from the Sunday on or before the start date, with the year in the title", () => {
    // September 7th 2026 is a Monday.
    const svg = renderChart({ startDate: "2026-09-07" });
    expect(xLabels(svg).slice(0, 3)).toEqual(["Sep 6", "Sep 20", "Oct 4"]);
    expect(xLabels(svg).at(-1)).toBe("Jan 24");
    expect(xLabels(renderChart({ startDate: "2026-09-06" }))[0]).toBe("Sep 6");
    expect(xLabels(renderChart({ startDate: "2026-09-12" }))[0]).toBe("Sep 6");
    expect(svg).toContain(">Successive calendar days · 2026–2027</text>");
    expect(renderChart({ startDate: "2026-01-05" })).toContain(">Successive calendar days · 2026</text>");
  });

  it("draws the counts from the start date, leaving the days before it empty", () => {
    // September 9th 2026 is a Wednesday, three days after the chart's Sunday.
    const svg = renderChart({ startDate: "2026-09-09", corrects: [10], errors: [2], timingSeconds: [60] });
    expect(svg).toContain(`<circle class="correct" cx="${3 * DAY_WIDTH}"`);
    expect(svg.match(/<circle class="correct"/g)).toHaveLength(1);
    expect(svg.match(/<path class="floor"/g)).toHaveLength(1);
    expect(svg).toContain('data-card="Wed, Sep 9 · Correct');
    expect(svg).toContain('data-card="Wed, Sep 9 · Error');
  });

  it("counts phase end days from the start date and runs the last phase to the end of the chart", () => {
    const svg = renderChart({
      startDate: "2026-09-09",
      phases: [{ name: "Baseline", endDay: 4 }, { name: "Practice", aim: 50 }],
    });
    const phaseX = Number(svg.match(/<path class="phase" d="M([\d.]+) /)?.[1]);
    expect(phaseX).toBeCloseTo((4 + 3 + 0.5) * DAY_WIDTH);
    expect(svg).toContain('data-card="Sun, Jan 24 · Aim');
  });

  it("reports phase end days as given", () => {
    expect(() =>
      renderChart({ startDate: "2026-09-09", phases: [{ name: "A", endDay: 4 }, { name: "B", endDay: 2 }, { name: "C" }] }),
    ).toThrow('Phase "B" needs an endDay on or after day 5, got 2');
  });

  it("dates the cards", () => {
    const svg = renderChart({ startDate: "2026-09-07", corrects: [10, -1, 20], timingSeconds: [60, -1, 60] });
    const lines = svg.match(/data-card="(Mon, Sep 7 · Correct[^"]*)"/)?.[1]?.split("&#10;");
    expect(lines?.[3]).toMatch(/^Wed, Sep 9 target/);
    expect(lines?.[4]).toBe("Wed, Sep 9: 20 per minute — Hit");
    expect(svg).toContain('data-card="Mon, Sep 7 · Record floor');
  });
});

describe("renderChart validation", () => {
  const throwsFor = (options: unknown) => expect(() => renderChart(options as ChartOptions));

  it("draws a full chart of valid data without throwing", () => {
    const counts = Array.from({ length: DAYS + 1 }, (_, day) => (day % 7 === 0 ? -1 : 10));
    expect(() => timed({ corrects: counts, errors: counts, phases: [{ name: "A", endDay: DAYS }] })).not.toThrow();
    // September 9th 2026 is a Wednesday, leaving room for three fewer days.
    expect(() => timed({ corrects: Array<number>(DAYS - 2).fill(10), startDate: "2026-09-09" })).not.toThrow();
  });

  it("throws for lists of different lengths", () => {
    throwsFor({ corrects: [5, 5, 5], timingSeconds: [60] }).toThrow(
      "corrects, errors and timingSeconds must have one entry for each day, but corrects has 3, timingSeconds has 1",
    );
    throwsFor({ corrects: [5, 5], errors: [1], timingSeconds: [60, 60] }).toThrow("errors has 1");
    throwsFor({ corrects: [5], timingSeconds: [60, 60] }).toThrow(RangeError);
  });

  it("throws for counts without timings", () => {
    throwsFor({ corrects: [5] }).toThrow("corrects need timingSeconds to be plotted per minute");
    throwsFor({ corrects: [5], errors: [1] }).toThrow("corrects and errors need timingSeconds");
  });

  it("throws unless each day is timed with every count, or unrecorded in every list", () => {
    throwsFor({ corrects: [5, 5], timingSeconds: [60, -1] }).toThrow("Day 1 has corrects of 5 but no timing");
    throwsFor({ corrects: [5, -1], timingSeconds: [60, 60] }).toThrow("Day 1 has a timing but no corrects");
    throwsFor({ corrects: [5, 5], errors: [1, -1], timingSeconds: [60, 60] }).toThrow("Day 1 has a timing but no errors");
  });

  it("throws for anything but a number, naming it", () => {
    throwsFor({ corrects: [5, null], timingSeconds: [60, 60] }).toThrow("corrects[1] must be a number, got null");
    throwsFor({ corrects: [5, ""], timingSeconds: [60, 60] }).toThrow('corrects[1] must be a number, got ""');
    throwsFor({ corrects: ["5"], timingSeconds: [60] }).toThrow('corrects[0] must be a number, got "5"');
    throwsFor({ errors: [NaN], timingSeconds: [60] }).toThrow(TypeError);
    // eslint-disable-next-line no-sparse-arrays
    throwsFor({ corrects: [5, , 5], timingSeconds: [60, 60, 60] }).toThrow("corrects[1] must be a number, got undefined");
    throwsFor({ corrects: [5], timingSeconds: [Infinity] }).toThrow(TypeError);
    throwsFor({ corrects: "5, 5", timingSeconds: [60] }).toThrow("corrects must be an array of numbers");
  });

  it("throws for counts that are not whole numbers of 0 or more, or -1", () => {
    throwsFor({ corrects: [2.5], timingSeconds: [60] }).toThrow("corrects[0] must be a whole count of 0 or more, or -1");
    throwsFor({ errors: [-2], timingSeconds: [60] }).toThrow(RangeError);
  });

  it("throws for timings without a record floor on the chart, and for 0 instead of -1", () => {
    throwsFor({ timingSeconds: [0] }).toThrow("timingSeconds[0] must be from 0.06 to 60000 seconds, or -1 for no timing, got 0");
    throwsFor({ timingSeconds: [0.03] }).toThrow(RangeError);
    throwsFor({ timingSeconds: [2000 * 60] }).toThrow(RangeError);
    expect(() => renderChart({ timingSeconds: [0.06, 60000] })).not.toThrow();
  });

  it("throws for a rate above the top of the chart", () => {
    throwsFor({ corrects: [1001], timingSeconds: [60] }).toThrow(
      "Day 0 has corrects of 1001 in 60 seconds, above the chart's 1000 per minute",
    );
  });

  it("throws for days past the end of the chart, counting from the start date", () => {
    throwsFor({ timingSeconds: Array<number>(DAYS + 2).fill(60) }).toThrow(
      `timingSeconds has ${DAYS + 2} days, but the chart only has room for ${DAYS + 1} days`,
    );
    throwsFor({ timingSeconds: Array<number>(DAYS - 1).fill(60), startDate: "2026-09-09" }).toThrow(
      `room for ${DAYS - 2} days from its start date`,
    );
  });

  it("throws for phases that end out of order, part way through a day or past the chart", () => {
    throwsFor({ phases: [{ name: "A", endDay: 10 }, { name: "B", endDay: 5 }] }).toThrow(
      'Phase "B" needs an endDay on or after day 11, got 5',
    );
    throwsFor({ phases: [{ name: "A", endDay: 2.5 }, { name: "B" }] }).toThrow(
      'Phase "A" needs an endDay on or after day 0, got 2.5',
    );
    throwsFor({ phases: [{ name: "A", endDay: DAYS + 1 }] }).toThrow(`Phase "A" ends on day ${DAYS + 1}, but`);
    throwsFor({ phases: [{ name: "A", endDay: DAYS }, { name: "B" }] }).toThrow(`Phase "B" starts on day ${DAYS + 1}, but`);
  });

  it("throws for aims off the chart and celerations that are not above 0", () => {
    throwsFor({ phases: [{ name: "A", aim: 2000 }] }).toThrow('Phase "A" needs an aim from 0.001 to 1000 per minute, got 2000');
    throwsFor({ phases: [{ name: "A", aim: 0 }] }).toThrow(RangeError);
    throwsFor({ phases: [{ name: "A", celeration: 0 }] }).toThrow('Phase "A" needs a celeration above 0, got 0');
    throwsFor({ phases: [{ name: "A", celeration: -2 }] }).toThrow(RangeError);
    throwsFor({ phases: [{ name: "A", celeration: NaN }] }).toThrow(RangeError);
  });

  it("throws for phases without a name", () => {
    throwsFor({ phases: [{ endDay: 3 }] }).toThrow("phases[0] must have a name, got undefined");
    throwsFor({ phases: [null] }).toThrow("phases[0] must be an object, got null");
  });
});
