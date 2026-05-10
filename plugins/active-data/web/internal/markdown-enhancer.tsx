import { useCallback, useMemo, type ReactNode } from "react";
import {
  MarkdownEnhancementContext,
  useMarkdownEnhancement,
  type MarkdownEnhancement,
} from "@plugins/primitives/plugins/markdown/web";
import { useActiveDataLinkify } from "./linkify-active-data";

export function ActiveDataMarkdownEnhancer({
  children,
}: {
  children: ReactNode;
}) {
  const linkify = useActiveDataLinkify();

  const inlineCode = useCallback(
    (text: string): ReactNode | null => {
      const result = linkify(text);
      return result !== text ? (result as ReactNode) : null;
    },
    [linkify],
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
