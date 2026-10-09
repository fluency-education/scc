import { describe, expect, it } from "vitest";
import { dayScale, frequencyScale, toFrequency } from "./scale.js";

describe("frequencyScale", () => {
  const y = frequencyScale({ top: 0, bottom: 600 });

  it("places the range ends at bottom and top", () => {
    expect(y(0.001)).toBeCloseTo(600);
    expect(y(1000)).toBeCloseTo(0);
  });

  it("gives each x10 cycle equal height", () => {
    expect(y(1)).toBeCloseTo(300);
    expect(y(10) - y(1)).toBeCloseTo(y(100) - y(10));
  });

  it("rejects non-positive frequencies", () => {
    expect(() => y(0)).toThrow(RangeError);
  });
});

describe("toFrequency", () => {
  it("divides count by minutes", () => {
    expect(toFrequency(30, 0.5)).toBe(60);
  });
});

describe("dayScale", () => {
  it("maps day 0 to left and the last day to right", () => {
    const x = dayScale({ left: 10, right: 290 });
    expect(x(0)).toBe(10);
    expect(x(140)).toBe(290);
    expect(x(70)).toBe(150);
  });
});
