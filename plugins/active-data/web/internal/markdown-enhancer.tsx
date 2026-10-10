import { useCallback, useMemo, type ReactNode } from "react";
import type { Components } from "react-markdown";
import {
  MarkdownEnhancementContext,
  useMarkdownEnhancement,
  type MarkdownEnhancement,
} from "@plugins/primitives/plugins/markdown/web";
import { useActiveDataLinkify } from "./linkify-active-data";
import { ActiveDataCodeChain } from "./code-chain";
import {
  anyCandidateMatches,
  useActiveDataCodeCandidates,
} from "./use-code-candidates";
import { ActiveData } from "../slots";
import { INLINE_TAG_ELEMENT, remarkInlineTags } from "./remark-inline-tags";
import { ActiveDataInlineTag } from "./inline-tag";

// A custom element name is not a key of react-markdown's `Components` (typed
// over the intrinsic elements), so the map is built loose and widened once.
const INLINE_TAG_COMPONENTS = {
  [INLINE_TAG_ELEMENT]: ActiveDataInlineTag,
} as Partial<Components>;

export function ActiveDataMarkdownEnhancer({
  children,
}: {
  children: ReactNode;
}) {
  const linkify = useActiveDataLinkify();
  const candidates = useActiveDataCodeCandidates();
  const contributions = ActiveData.Tag.useContributions();
  // Joined to a string so the plugin list keeps its identity (it is part of the
  // markdown renderer's memo key) until the SET of inline tags changes.
  const inlineTags = contributions
    .flatMap((c) => (c.display === "block" && c.inline ? [c.tag] : []))
    .join(" ");
  const remarkPlugins = useMemo(
    () => (inlineTags ? remarkInlineTags(inlineTags.split(" ")) : undefined),
    [inlineTags],
  );

  const inlineCode = useCallback(
    (text: string): ReactNode | null => {
      // Inline patterns first — they have specific, high-confidence regexes
      // and must run before broad code patterns (e.g. plugin-link) that
      // match any kebab-case string and rely on runtime validation.
      const result = linkify(text);
      if (result !== text) return result as ReactNode;
      // SYNTACTIC pre-test only. If no code contribution can even full-match this
      // span, return null so the NEXT enhancer plugin still gets its turn
      // (markdown-extensions' URL / file-path handler). Whether a matching
      // candidate can actually RESOLVE the token is the chain's business, not
      // ours: deciding it here would need the claims, and the claims are hooks.
      if (!anyCandidateMatches(candidates, text)) return null;
      return <ActiveDataCodeChain text={text} />;
    },
    [linkify, candidates],
  );

  const enhancement = useMemo(
    (): MarkdownEnhancement => ({
      transform: linkify,
      inlineCode,
      ...(remarkPlugins && {
        remarkPlugins,
        components: INLINE_TAG_COMPONENTS,
      }),
    }),
    [linkify, inlineCode, remarkPlugins],
  );

  const value = useMarkdownEnhancement(enhancement);
  return (
    <MarkdownEnhancementContext.Provider value={value}>
      {children}
    </MarkdownEnhancementContext.Provider>
  );
}
