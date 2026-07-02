import { useMemo, type ComponentType, type ReactNode } from "react";
import { defineSlot, type Slot } from "@plugins/framework/plugins/web-sdk/core";
import { lazyComponent } from "@plugins/primitives/plugins/lazy-component/web";

export const MarkdownEnhancerSlot: Slot<{
  id: string;
  order: number;
  Component: ComponentType<{ children: ReactNode }>;
}> = defineSlot("markdown.enhancer");

// The heavy renderer (react-markdown + remark-gfm + the syntax-highlighter base
// map) is code-split into its own chunk so it never rides the eager plugin-boot
// wave — it loads on the first markdown render of the session. `fallback: null`
// because markdown is inline in transcripts: a spinner would be jarring, so it
// just pops in once the chunk resolves (only the first render suspends).
const MarkdownRenderer = lazyComponent<{ children: string }>(
  () => import("./markdown-renderer").then((m) => ({ default: m.MarkdownRenderer })),
  { fallback: null },
);

export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const enhancers = MarkdownEnhancerSlot.useContributions();

  const sorted = useMemo(
    () => [...enhancers].sort((a, b) => a.order - b.order),
    [enhancers],
  );

  let content: ReactNode = <MarkdownRenderer>{children}</MarkdownRenderer>;

  for (let i = sorted.length - 1; i >= 0; i--) {
    const { Component } = sorted[i]!;
    content = <Component>{content}</Component>;
  }

  return className ? (
    <div className={className}>{content}</div>
  ) : (
    <>{content}</>
  );
}
