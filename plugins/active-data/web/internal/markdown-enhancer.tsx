import { useCallback, useMemo, type ReactNode } from "react";
import {
  MarkdownEnhancementContext,
  useMarkdownEnhancement,
  type MarkdownEnhancement,
} from "@plugins/primitives/plugins/markdown/web";
import { useActiveDataLinkify } from "./linkify-active-data";
import { ActiveDataCodeChain } from "./code-chain";
import { anyCandidateMatches, useActiveDataCodeCandidates } from "./use-code-candidates";

export function ActiveDataMarkdownEnhancer({
  children,
}: {
  children: ReactNode;
}) {
  const linkify = useActiveDataLinkify();
  const candidates = useActiveDataCodeCandidates();

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
