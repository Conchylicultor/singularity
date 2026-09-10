import { useRef, useState, type ReactNode } from "react";
import { Sticky } from "@plugins/primitives/plugins/css/plugins/sticky/web";
import { useInView } from "@plugins/primitives/plugins/dom/plugins/in-view/web";
import { PaneScroll } from "./pane-scroll";

/**
 * The pane's one scroll with its header floating over the top of it — the body
 * of a `<PaneChrome floatingHeader>`.
 *
 * The header is the scroll's first child, pinned to its top edge, so the page
 * can run up behind it. It is see-through while the body sits at its top and
 * masks what scrolls under it once anything does: `header(atTop)` is told
 * which, so the bar can drop its rule while there is nothing to separate.
 *
 * "At the top" is read from a zero-height marker at the head of the scrolled
 * content, watched against the scroll itself: it is in view exactly while the
 * scroll offset is zero. An observer, not a scroll listener — it delivers only
 * when the answer changes.
 */
export function FloatingHeaderScroll({
  header,
  children,
}: {
  header: (atTop: boolean) => ReactNode;
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  // Every scroll opens at its top, and the first delivery confirms or corrects
  // it within a frame.
  const [atTop, setAtTop] = useState(true);
  useInView(topRef, (entry) => setAtTop(entry.isIntersecting), {
    root: scrollRef,
  });
  return (
    <PaneScroll ref={scrollRef}>
      <div ref={topRef} aria-hidden />
      <Sticky mask={!atTop} className="transition-colors">
        {header(atTop)}
      </Sticky>
      {children}
    </PaneScroll>
  );
}
