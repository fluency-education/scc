import { describe, expect, it } from "vitest";
import { ZOOM_STEPS, zoomView } from "./zoom.js";

describe("ZOOM_STEPS", () => {
  it("starts at the whole chart and climbs in steps to a limit", () => {
    expect(ZOOM_STEPS[0]).toBe(1);
    expect([...ZOOM_STEPS]).toEqual([...ZOOM_STEPS].sort((a, b) => a - b));
    expect(Math.max(...ZOOM_STEPS)).toBe(4);
  });
});

describe("zoomView", () => {
  const frame = { x: -3, y: -3, width: 400, height: 200 };

  it("shows the whole frame at 1×", () => {
    expect(zoomView(frame, 1, { x: 50, y: 50 })).toEqual(frame);
  });

  it("shrinks the view by the zoom, centred on the given point", () => {
    expect(zoomView(frame, 2, { x: 150, y: 80 })).toEqual({ x: 50, y: 30, width: 200, height: 100 });
  });

  it("keeps the view inside the frame", () => {
    expect(zoomView(frame, 4, { x: -100, y: -100 })).toEqual({ x: -3, y: -3, width: 100, height: 50 });
    expect(zoomView(frame, 4, { x: 1000, y: 1000 })).toEqual({ x: 297, y: 147, width: 100, height: 50 });
  });
});
