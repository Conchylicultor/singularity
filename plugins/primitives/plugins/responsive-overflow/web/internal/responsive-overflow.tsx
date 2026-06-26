import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MeasureStrip } from "@plugins/primitives/plugins/css/plugins/measure-strip/web";
import { useResizeObserver } from "@plugins/primitives/plugins/element-size/web";
import {
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

export interface UseResponsiveOverflowOptions {
  count: number;
  gap?: number;
  constraintRef?: RefObject<HTMLElement | null>;
}

export interface UseResponsiveOverflowHandle {
  containerRef: RefObject<HTMLDivElement | null>;
  measureRef: RefObject<HTMLDivElement | null>;
  visibleCount: number;
}

/** Walk up through display:contents to find the actual flex parent. */
function findFlexParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const d = getComputedStyle(node).display;
    if (d !== "contents") return d.includes("flex") ? node : null;
    node = node.parentElement;
  }
  return null;
}

/** Collect effective flex children, walking through display:contents. */
function effectiveChildren(parent: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const ch of Array.from(parent.children) as HTMLElement[]) {
    if (getComputedStyle(ch).display === "contents") {
      out.push(...effectiveChildren(ch));
    } else {
      out.push(ch);
    }
  }
  return out;
}

/**
 * In the flex parent of `node`, zero out flex-grow on any sibling
 * effective flex children that would compete for space.
 */
function suppressSiblingGrow(
  node: HTMLElement,
  saved: { el: HTMLElement; css: string }[],
) {
  const flexParent = findFlexParent(node);
  if (!flexParent) return;
  for (const sib of effectiveChildren(flexParent)) {
    if (sib === node || sib.contains(node) || node.contains(sib)) continue;
    if (getComputedStyle(sib).flexGrow !== "0") {
      saved.push({ el: sib, css: sib.style.cssText });
      sib.style.flexGrow = "0";
    }
  }
}

/**
 * Walk up to find an ancestor whose width tracks available layout space, not
 * its content. Content-sized ancestors (flex-grow: 0) shrink with the container
 * and never trigger re-expansion. The first ancestor with flex-grow > 0 fills
 * its flex parent and will resize when the viewport or layout changes. Pure DOM
 * walk — deterministic, so re-deriving it per call is behavior-identical to
 * computing it once.
 */
function findObservedAncestor(container: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = container.parentElement;
  while (node) {
    const s = getComputedStyle(node);
    if (s.display !== "contents" && s.flexGrow !== "0") return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * The width available to the container. With an explicit `constraint` element,
 * its width is authoritative. Otherwise temporarily make the entire chain from
 * container to the observed ancestor "greedy" (flex: 1 1 0), and suppress
 * flex-grow on competing siblings (e.g. reorder spacers). The flex engine then
 * gives the container exactly the available space. Mutate → forced reflow
 * (offsetWidth) → restore in one synchronous block — the browser never paints
 * the intermediate state.
 *
 * Module-level (operates on explicit elements, never the hook's props/refs) so
 * the React Compiler doesn't read its DOM mutations as render-time prop writes.
 */
function measureAvailable(
  container: HTMLElement,
  observedAncestor: HTMLElement | null,
  constraint: HTMLElement | null,
): number {
  if (constraint) return constraint.offsetWidth;
  if (!observedAncestor) return container.offsetWidth;

  const saved: { el: HTMLElement; css: string }[] = [];
  const save = (el: HTMLElement) => saved.push({ el, css: el.style.cssText });

  let node: HTMLElement | null = container;
  while (node && node !== observedAncestor) {
    if (getComputedStyle(node).display !== "contents") {
      save(node);
      node.style.flex = "1 1 0";
      node.style.minWidth = "0";
      // Suppress flex-grow on siblings in the same flex context so they don't
      // compete for space during measurement.
      suppressSiblingGrow(node, saved);
    }
    node = node.parentElement;
  }
  const w = container.offsetWidth;
  for (const { el, css } of saved) el.style.cssText = css;
  return w;
}

/**
 * How many of `measure`'s children fit within the container's available width,
 * accounting for the inter-item `gap`. Module-level for the same reason as
 * {@link measureAvailable}.
 */
function computeVisibleCount(
  container: HTMLElement,
  measure: HTMLElement,
  constraint: HTMLElement | null,
  gap: number,
): number {
  const observedAncestor = constraint ? null : findObservedAncestor(container);
  const available = measureAvailable(container, observedAncestor, constraint);
  const items = Array.from(measure.children) as HTMLElement[];
  if (items.length === 0) return 0;

  const totalW = items.reduce(
    (acc, el, i) => acc + el.offsetWidth + (i > 0 ? gap : 0),
    0,
  );
  if (totalW <= available) return items.length;

  let used = 0;
  let fitCount = 0;
  for (const [i, item] of items.entries()) {
    const gapBefore = i > 0 ? gap : 0;
    const next = used + gapBefore + item.offsetWidth;
    if (next <= available) {
      used = next;
      fitCount = i + 1;
    } else {
      break;
    }
  }
  return fitCount;
}

export function useResponsiveOverflow({
  count,
  gap = 4,
  constraintRef,
}: UseResponsiveOverflowOptions): UseResponsiveOverflowHandle {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(count);

  const recompute = () => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    if (constraintRef && !constraintRef.current) return;

    const constraint = constraintRef?.current ?? null;
    setVisibleCount(computeVisibleCount(container, measure, constraint, gap));
  };

  useResizeObserver(
    () => {
      const container = containerRef.current;
      if (!container) return null;
      if (constraintRef && !constraintRef.current) return null;
      const constraint = constraintRef?.current ?? null;
      if (constraint) return constraint;
      const ancestor = findObservedAncestor(container);
      return ancestor ? [container, ancestor] : container;
    },
    recompute,
    { deps: [count, gap, constraintRef] },
  );

  return { containerRef, measureRef, visibleCount };
}

export interface ResponsiveOverflowProps {
  children: ReactNode[];
  /** Gap between children in pixels. Default: 4 (= gap-1). */
  gap?: number;
  className?: string;
  /** Optional external element to observe for available width instead of the container itself. */
  constraintRef?: RefObject<HTMLElement | null>;
}

export function ResponsiveOverflow({
  children,
  gap = 4,
  className,
  constraintRef,
}: ResponsiveOverflowProps) {
  const { containerRef, measureRef, visibleCount } = useResponsiveOverflow({
    count: children.length,
    gap,
    constraintRef,
  });

  return (
    <>
      <MeasureStrip ref={measureRef} gap={gap} enabled={children.length > 0}>
        {children.map((child, i) => (
          <div key={i}>{child}</div>
        ))}
      </MeasureStrip>

      <div
        ref={containerRef}
        // eslint-disable-next-line layout/no-adhoc-layout -- measurement-based primitive: the inline-flex/min-w-0/overflow-hidden mechanics are integral to width-driven child hiding and have no primitive equivalent
        className={cn("inline-flex min-w-0 overflow-hidden whitespace-nowrap", className)}
        style={{ gap }}
      >
        {children.slice(0, visibleCount)}
      </div>
    </>
  );
}
