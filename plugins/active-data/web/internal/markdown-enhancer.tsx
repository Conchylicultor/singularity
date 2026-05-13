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
      // Inline patterns first — they have specific, high-confidence regexes
      // and must run before broad code patterns (e.g. plugin-link) that
      // match any kebab-case string and rely on runtime validation.
      const result = linkify(text);
      if (result !== text) return result as ReactNode;
      // display:"code" contributions are matched against the full code text
      // only — never applied to regular text nodes.
      for (const { pattern, Component } of codeContribs) {
        const re = new RegExp(pattern.source, pattern.flags.replace("g", ""));
        const m = re.exec(text);
        if (m && m[0] === text) return <Component content={text} attrs={{}} />;
      }
      return null;
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
