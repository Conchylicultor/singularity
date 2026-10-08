/** The axis a host lays its children out along. */
export type FlowAxis = "row" | "column";

/**
 * The element that actually lays `node` out: its nearest ancestor that draws a
 * box. A `display: contents` wrapper draws none — its children take part in
 * ITS parent's layout — so it is skipped. Measuring the wrapper instead is the
 * trap this exists to close: its `clientWidth` is 0 and it never resizes.
 */
export function layoutHost(node: Element): Element | null {
  let el = node.parentElement;
  while (el && getComputedStyle(el).display === "contents") {
    el = el.parentElement;
  }
  return el;
}

/**
 * The axis `host` flows its children along. `row` only for a flex container
 * with a row direction: `flex-direction`'s computed value is `row` for EVERY
 * element (it is the CSS initial value, reported whatever the `display`), so
 * reading it alone calls every block, grid and `display: contents` box a row.
 */
export function flowAxis(host: Element): FlowAxis {
  const style = getComputedStyle(host);
  const isFlex = style.display === "flex" || style.display === "inline-flex";
  const dir = style.flexDirection;
  return isFlex && (dir === "row" || dir === "row-reverse") ? "row" : "column";
}
