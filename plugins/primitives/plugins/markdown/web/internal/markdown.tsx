import { useContext, useMemo, useRef, type ReactNode } from "react";
import ReactMarkdownLib from "react-markdown";
import remarkGfm from "remark-gfm";
import { defineSlot, type Slot } from "@plugins/framework/plugins/web-sdk/core";
import type { ComponentType } from "react";
import { MarkdownEnhancementContext } from "./enhancement-context";
import { buildBaseComponents, stripNodeProp } from "./base-components";

const REMARK_PLUGINS = [remarkGfm];

export const MarkdownEnhancerSlot: Slot<{
  id: string;
  order: number;
  Component: ComponentType<{ children: ReactNode }>;
}> = defineSlot("markdown.enhancer");

function MarkdownRenderer({ children }: { children: string }) {
  const enhancement = useContext(MarkdownEnhancementContext);
  const { components: overrides } = enhancement;

  // Keep the live context value in a ref so the stable accessors below read the
  // latest transforms / inline-code handlers at call time without forcing any
  // component identity to change.
  const ref = useRef(enhancement);
  ref.current = enhancement;

  // Base map built ONCE (empty deps): every base tag — including `code` — gets a
  // permanent identity, so react-markdown never remounts them on a re-render.
  // The accessors read `ref.current`, so live data is reflected in place.
  const base = useMemo(
    () =>
      stripNodeProp(
        buildBaseComponents(
          (c: ReactNode) => ref.current.transforms.reduce((acc, fn) => fn(acc), c),
          () => ref.current.inlineCodeHandlers,
        ),
      ),
    [],
  );

  // Overrides re-wrap only when the override map actually changes; `code` lives
  // only in `base`, so its identity is constant forever.
  const strippedOverrides = useMemo(() => stripNodeProp(overrides), [overrides]);

  const components = useMemo(
    () => ({ ...base, ...strippedOverrides }),
    [base, strippedOverrides],
  );

  return (
    <ReactMarkdownLib remarkPlugins={REMARK_PLUGINS} components={components}>
      {children}
    </ReactMarkdownLib>
  );
}

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
