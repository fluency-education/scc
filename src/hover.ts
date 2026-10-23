const SVG_NS = "http://www.w3.org/2000/svg";
/** Space inside a card around its text, in SVG units. */
const CARD_PADDING = 3;
/** Distance between lines of a card, in SVG units. */
const CARD_LINE_HEIGHT = 6.5;
/** How far a card sits from what it describes, in SVG units. */
const CARD_OFFSET = 4;

/**
 * Makes a chart from `renderChart` show a card of each mark's or line's details
 * while the pointer is over it. Returns a function that undoes it.
 */
export function enableHover(svg: SVGSVGElement): () => void {
  const plot = svg.querySelector<SVGSVGElement>("svg.plot");
  if (!plot) throw new Error("enableHover needs a chart from renderChart");

  const card = document.createElementNS(SVG_NS, "g");
  card.classList.add("card");
  card.style.display = "none";
  const background = document.createElementNS(SVG_NS, "rect");
  background.setAttribute("rx", "1.5");
  const text = document.createElementNS(SVG_NS, "text");
  card.append(background, text);
  // Last in the chart, so it is drawn over everything, and outside the plot so
  // zooming neither clips nor scales it.
  svg.append(card);

  /** Converts a point on screen into the chart's own units. */
  const toChart = (clientX: number, clientY: number) => {
    const matrix = svg.getScreenCTM()?.inverse();
    return matrix ? new DOMPoint(clientX, clientY).matrixTransform(matrix) : new DOMPoint();
  };

  const show = (target: SVGGraphicsElement, pointer: PointerEvent) => {
    const lines = target.dataset.card?.split("\n") ?? [];
    text.replaceChildren(
      ...lines.map((line, index) => {
        const span = document.createElementNS(SVG_NS, "tspan");
        span.setAttribute("x", "0");
        span.setAttribute("dy", index === 0 ? "0" : String(CARD_LINE_HEIGHT));
        span.textContent = line;
        if (index === 0) span.classList.add("card-title");
        if (index === lines.length - 1 && target.dataset.result) span.classList.add(target.dataset.result);
        return span;
      }),
    );
    card.style.display = "";
    const box = text.getBBox();
    const width = box.width + 2 * CARD_PADDING;
    const height = box.height + 2 * CARD_PADDING;
    background.setAttribute("x", String(box.x - CARD_PADDING));
    background.setAttribute("y", String(box.y - CARD_PADDING));
    background.setAttribute("width", String(width));
    background.setAttribute("height", String(height));

    // A mark's card points at the mark; a line's at the pointer, somewhere along it.
    const rect = target.getBoundingClientRect();
    const anchor = target.classList.contains("mark")
      ? toChart(rect.left + rect.width / 2, rect.top + rect.height / 2)
      : toChart(pointer.clientX, pointer.clientY);
    // Above and to the right, unless that would run off the chart.
    const bounds = svg.viewBox.baseVal;
    let left = anchor.x + CARD_OFFSET;
    if (left + width > bounds.x + bounds.width) left = anchor.x - CARD_OFFSET - width;
    let top = anchor.y - CARD_OFFSET - height;
    if (top < bounds.y) top = anchor.y + CARD_OFFSET;
    card.setAttribute("transform", `translate(${left - box.x + CARD_PADDING} ${top - box.y + CARD_PADDING})`);
  };
  const hide = () => {
    card.style.display = "none";
  };

  const over = (event: PointerEvent) => {
    const target = (event.target as Element | null)?.closest<SVGGraphicsElement>("[data-card]");
    if (target && plot.contains(target)) show(target, event);
    else hide();
  };
  // Zooming and dragging move the marks out from under their cards.
  plot.addEventListener("pointerover", over);
  plot.addEventListener("pointerleave", hide);
  svg.addEventListener("pointerdown", hide);

  return () => {
    plot.removeEventListener("pointerover", over);
    plot.removeEventListener("pointerleave", hide);
    svg.removeEventListener("pointerdown", hide);
    card.remove();
  };
}
