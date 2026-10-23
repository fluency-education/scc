/**
 * Zoom levels the chart steps through, from the whole chart up to the closest
 * look allowed.
 */
export const ZOOM_STEPS = [1, 1.5, 2, 3, 4] as const;

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
 * Makes a chart from `renderChart` zoomable: shows its zoom control, steps
 * through ZOOM_STEPS when the buttons are pressed, and pans when the zoomed
 * chart is dragged. The axis labels follow the grid. Returns a function that
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

  let step = 0;
  let view = frame;

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
    show(zoomView(frame, ZOOM_STEPS[step] ?? 1, centre()));
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

  let drag: { pointerId: number; clientX: number; clientY: number } | undefined;
  listen(plot, "pointerdown", (event) => {
    if (step === 0 || event.button !== 0) return;
    drag = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
    plot.setPointerCapture(event.pointerId);
    plot.classList.add("dragging");
  });
  listen(plot, "pointermove", (event) => {
    if (event.pointerId !== drag?.pointerId) return;
    // The plot's own box takes in everything drawn outside its viewport, so
    // measure the whole chart, which has the same scale.
    const pixelsPerUnit = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    const zoom = ZOOM_STEPS[step] ?? 1;
    const dx = (event.clientX - drag.clientX) / pixelsPerUnit / zoom;
    const dy = (event.clientY - drag.clientY) / pixelsPerUnit / zoom;
    drag = { ...drag, clientX: event.clientX, clientY: event.clientY };
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
    show(frame);
    svg.classList.remove("zoomable");
  };
}
