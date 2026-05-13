import { useContext, useMemo, type ReactNode } from "react";
import ReactMarkdownLib from "react-markdown";
import remarkGfm from "remark-gfm";
import { defineSlot, type Slot } from "@core";
import type { ComponentType } from "react";
import { MarkdownEnhancementContext } from "./enhancement-context";
import { buildBaseComponents } from "./base-components";

const REMARK_PLUGINS = [remarkGfm];

export const MarkdownEnhancerSlot: Slot<{
  id: string;
  order: number;
  Component: ComponentType<{ children: ReactNode }>;
}> = defineSlot("markdown.enhancer");

function MarkdownRenderer({ children }: { children: string }) {
  const { transforms, components: overrides, inlineCodeHandlers } = useContext(
    MarkdownEnhancementContext,
  );
  const components = useMemo(() => {
    const transform = (c: ReactNode) =>
      transforms.reduce((acc, fn) => fn(acc), c);
    const base = buildBaseComponents(transform, inlineCodeHandlers);
    return { ...base, ...overrides };
  }, [transforms, overrides, inlineCodeHandlers]);

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
