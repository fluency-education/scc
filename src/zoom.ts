/**
 * Zoom levels the chart steps through, from the whole chart up to the closest
 * look allowed.
 */
export const ZOOM_STEPS = [1, 1.5, 2] as const;

/** A rectangle of the chart, in SVG units. */
export interface View {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The part of `frame` shown at `zoom`, centred as near `centre` as it can be
 * while staying inside the frame.
 */
export function zoomView(frame: View, zoom: number, centre: { x: number; y: number }): View {
  const width = frame.width / zoom;
  const height = frame.height / zoom;
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
  return {
    x: clamp(centre.x - width / 2, frame.x, frame.x + frame.width - width),
    y: clamp(centre.y - height / 2, frame.y, frame.y + frame.height - height),
    width,
    height,
  };
}

/**
 * The part of `frame` shown at `zoom` when looking at `focus`: centred on it,
 * or when it is too wide to fit, showing its right end, where the latest days
 * are. Stays inside the frame like zoomView.
 */
export function focusView(frame: View, zoom: number, focus: View): View {
  const width = frame.width / zoom;
  const x = focus.width <= width ? focus.x + focus.width / 2 : focus.x + focus.width - width / 2;
  return zoomView(frame, zoom, { x, y: focus.y + focus.height / 2 });
}

/**
 * Makes a chart from `renderChart` zoomable: shows its zoom control, steps
 * through ZOOM_STEPS when the buttons are pressed, and pans when the zoomed
 * chart is dragged. Zooming looks at the current phase until the chart is
 * dragged, then at the middle of what is on show. The axis labels follow the grid. Returns a function that
 * undoes it.
 */
export function enableZoom(svg: SVGSVGElement): () => void {
  const plot = svg.querySelector<SVGSVGElement>("svg.plot");
  const zoomIn = svg.querySelector<SVGElement>(".zoom-in");
  const zoomOut = svg.querySelector<SVGElement>(".zoom-out");
  const level = svg.querySelector<SVGTextElement>(".zoom-level");
  if (!plot || !zoomIn || !zoomOut || !level) {
    throw new Error("enableZoom needs a chart from renderChart");
  }
  const { x, y, width, height } = plot.viewBox.baseVal;
  const frame: View = { x, y, width, height };
  // Each label remembers where it was drawn, relative to the grid line it labels.
  const labels = (axis: "x" | "y") =>
    [...svg.querySelectorAll<SVGTextElement>(`text[data-${axis}]`)].map((label) => {
      const at = Number(label.dataset[axis]);
      return { label, at, offset: Number(label.getAttribute(axis)) - at };
    });
  const [xLabels, yLabels] = [labels("x"), labels("y")];
  // The current phase, which renderChart leaves out when there are no marks.
  const [fx = 0, fy = 0, fWidth = 0, fHeight = 0] = plot.dataset.focus?.split(" ").map(Number) ?? [];
  const focus = plot.dataset.focus ? { x: fx, y: fy, width: fWidth, height: fHeight } : undefined;

  let step = 0;
  let view = frame;
  // Whether the chart has been dragged since it was last zoomed all the way out.
  let panned = false;

  const show = (next: View) => {
    view = next;
    const zoom = ZOOM_STEPS[step] ?? 1;
    plot.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
    for (const [axis, axisLabels, start, size] of [
      ["x", xLabels, "x", "width"],
      ["y", yLabels, "y", "height"],
    ] as const) {
      for (const { label, at, offset } of axisLabels) {
        const position = frame[start] + (at - view[start]) * zoom;
        label.setAttribute(axis, String(position + offset));
        const inside = position >= frame[start] && position <= frame[start] + frame[size];
        label.style.visibility = inside ? "" : "hidden";
      }
    }
    level.textContent = `${zoom}×`;
    zoomOut.classList.toggle("disabled", step === 0);
    zoomIn.classList.toggle("disabled", step === ZOOM_STEPS.length - 1);
    plot.classList.toggle("zoomed", step > 0);
  };

  const centre = () => ({ x: view.x + view.width / 2, y: view.y + view.height / 2 });
  const zoomBy = (change: number) => {
    const next = Math.min(Math.max(step + change, 0), ZOOM_STEPS.length - 1);
    if (next === step) return;
    step = next;
    if (step === 0) panned = false;
    const zoom = ZOOM_STEPS[step] ?? 1;
    show(focus && !panned ? focusView(frame, zoom, focus) : zoomView(frame, zoom, centre()));
  };

  const listeners: [EventTarget, string, (event: never) => void][] = [];
  const listen = <K extends keyof SVGElementEventMap>(
    target: SVGElement,
    type: K,
    handler: (event: SVGElementEventMap[K]) => void,
  ) => {
    target.addEventListener(type, handler);
    listeners.push([target, type, handler]);
  };

  for (const [button, change] of [
    [zoomIn, 1],
    [zoomOut, -1],
  ] as const) {
    listen(button, "click", () => zoomBy(change));
    listen(button, "keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        zoomBy(change);
      }
    });
  }

  let drag: { pointerId: number; clientX: number; clientY: number; pixelsPerUnit: number } | undefined;
  listen(plot, "pointerdown", (event) => {
    if (step === 0 || event.button !== 0) return;
    // Measured once per drag, as measuring makes the browser lay out the page.
    // The plot's own box takes in everything drawn outside its viewport, so
    // measure the whole chart, which has the same scale.
    const pixelsPerUnit = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    drag = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, pixelsPerUnit };
    plot.setPointerCapture(event.pointerId);
    plot.classList.add("dragging");
  });
  listen(plot, "pointermove", (event) => {
    if (event.pointerId !== drag?.pointerId) return;
    const zoom = ZOOM_STEPS[step] ?? 1;
    const dx = (event.clientX - drag.clientX) / drag.pixelsPerUnit / zoom;
    const dy = (event.clientY - drag.clientY) / drag.pixelsPerUnit / zoom;
    drag = { ...drag, clientX: event.clientX, clientY: event.clientY };
    panned = true;
    const { x: cx, y: cy } = centre();
    show(zoomView(frame, ZOOM_STEPS[step] ?? 1, { x: cx - dx, y: cy - dy }));
  });
  const endDrag = (event: PointerEvent) => {
    if (event.pointerId !== drag?.pointerId) return;
    drag = undefined;
    plot.classList.remove("dragging");
  };
  listen(plot, "pointerup", endDrag);
  listen(plot, "pointercancel", endDrag);

  svg.classList.add("zoomable");
  show(frame);

  return () => {
    for (const [target, type, handler] of listeners) target.removeEventListener(type, handler as EventListener);
    step = 0;
    panned = false;
    show(frame);
    svg.classList.remove("zoomable");
  };
}
