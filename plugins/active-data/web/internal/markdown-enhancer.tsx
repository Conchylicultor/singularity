import { useCallback, useMemo, type ReactNode } from "react";
import {
  MarkdownEnhancementContext,
  useMarkdownEnhancement,
  type MarkdownEnhancement,
} from "@plugins/primitives/plugins/markdown/web";
import { useActiveDataLinkify } from "./linkify-active-data";
import { useActiveDataCodeReplace } from "./use-code-replace";

export function ActiveDataMarkdownEnhancer({
  children,
}: {
  children: ReactNode;
}) {
  const linkify = useActiveDataLinkify();
  const codeContribs = useActiveDataCodeReplace();

  const inlineCode = useCallback(
    (text: string): ReactNode | null => {
      // display:"code" contributions are matched against the full code text only —
      // never applied to regular text nodes.
      for (const { pattern, Component } of codeContribs) {
        const re = new RegExp(pattern.source, pattern.flags.replace("g", ""));
        const m = re.exec(text);
        if (m && m[0] === text) return <Component content={text} attrs={{}} />;
      }
      // display:"inline" patterns also apply inside code elements.
      const result = linkify(text);
      return result !== text ? (result as ReactNode) : null;
    },
    [linkify, codeContribs],
  );

  const enhancement = useMemo(
    (): MarkdownEnhancement => ({ transform: linkify, inlineCode }),
    [linkify, inlineCode],
  );

  const value = useMarkdownEnhancement(enhancement);
  return (
    <MarkdownEnhancementContext.Provider value={value}>
      {children}
    </MarkdownEnhancementContext.Provider>
  );
}
