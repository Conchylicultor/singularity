import { Scroll, type ScrollProps } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * `PaneScroll` props mirror `Scroll` minus the two axes the pane body fixes:
 * `axis` (always `"y"`) and `fill` (always on, so the viewport claims the pane's
 * leftover height and the overflow engages). Everything else — `hideScrollbar`,
 * `isolate`, `as`, `ref`, `className`, `children` — forwards straight through.
 */
export type PaneScrollProps = Omit<ScrollProps, "axis" | "fill">;

/**
 * The single sanctioned pane-body vertical scroll viewport — a dead-thin
 * `<Scroll axis="y" fill h-full>`. A pane body is exactly one `PaneScroll`; every
 * header inside it is a `<Sticky>`. Routing every pane body through this one idiom
 * makes "the pane owns exactly one scroll" a grep/doc target and keeps
 * `VirtualRows.findScrollParent` binding to a predictable viewport.
 *
 * No new mechanics over `Scroll`: it forwards `ref` (consumers may need the
 * scroll-container element), `as`, `hideScrollbar`, `isolate`, and composes
 * `className` last.
 */
export function PaneScroll({ className, ...rest }: PaneScrollProps) {
  return <Scroll axis="y" fill className={cn("h-full", className)} {...rest} />;
}
