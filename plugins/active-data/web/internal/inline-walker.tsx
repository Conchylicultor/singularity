import { useMemo, type ReactNode } from "react";
import {
  InlineTextWalkerContext,
  useInlineTextWalker,
  type InlineTextWalker,
} from "@plugins/primitives/plugins/inline-text/web";
import { useActiveDataLinkify } from "./linkify-active-data";

// Registers the active-data inline-pattern walker into the inline-text pipeline
// (order 0 — must run first, so it sees raw text and leaves chips for later
// walkers to skip). The plain-text counterpart of ActiveDataMarkdownEnhancer.
export function ActiveDataInlineWalker({ children }: { children: ReactNode }) {
  const linkify = useActiveDataLinkify();
  const walker = useMemo<InlineTextWalker>(
    () => ({ transform: linkify }),
    [linkify],
  );
  const value = useInlineTextWalker(walker);
  return (
    <InlineTextWalkerContext.Provider value={value}>
      {children}
    </InlineTextWalkerContext.Provider>
  );
}
