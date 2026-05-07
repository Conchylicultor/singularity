import { useMemo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";
import { Markdown } from "../slots";
import type { CodeHandler, MarkdownExtension } from "./types";
import { buildBaseComponents } from "./base-components";

const REMARK_PLUGINS = [remarkGfm];

function useCollectedExtensions(extensions: MarkdownExtension[]) {
  const transforms: Array<(children: ReactNode) => ReactNode> = [];
  const blockCodeHandlers: Array<NonNullable<CodeHandler["block"]>> = [];
  const inlineCodeHandlers: Array<NonNullable<CodeHandler["inline"]>> = [];
  const componentMaps: Array<Partial<Components>> = [];

  for (const ext of extensions) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- extensions are static (registered at boot); count never changes
    const transform = ext.useTransform?.() ?? null;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const codeHandler = ext.useCodeHandler?.() ?? null;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const components = ext.useComponents?.() ?? {};

    if (transform) transforms.push(transform);
    if (codeHandler?.block) blockCodeHandlers.push(codeHandler.block);
    if (codeHandler?.inline) inlineCodeHandlers.push(codeHandler.inline);
    componentMaps.push(components);
  }

  return { transforms, blockCodeHandlers, inlineCodeHandlers, componentMaps };
}

export function MarkdownContent({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const raw = Markdown.Extension.useContributions();
  const sorted = useMemo(
    () => [...raw].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100)),
    [raw],
  );

  const { transforms, blockCodeHandlers, inlineCodeHandlers, componentMaps } =
    useCollectedExtensions(sorted);

  const chainedTransform = useMemo(() => {
    if (transforms.length === 0) return (c: ReactNode) => c;
    return (children: ReactNode) =>
      transforms.reduce((acc, t) => t(acc), children);
  }, [transforms]);

  const components = useMemo(() => {
    const base = buildBaseComponents(
      chainedTransform,
      blockCodeHandlers,
      inlineCodeHandlers,
    );
    return Object.assign(base, ...componentMaps) as Components;
  }, [chainedTransform, blockCodeHandlers, inlineCodeHandlers, componentMaps]);

  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
