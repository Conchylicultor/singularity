import { useCallback, useMemo, type ReactNode } from "react";
import { parseFileLinks } from "@plugins/primitives/plugins/file-links/web";
import { LinkChip } from "@plugins/primitives/plugins/link-chip/web";
import {
  MarkdownEnhancementContext,
  useMarkdownEnhancement,
  type MarkdownEnhancement,
} from "@plugins/primitives/plugins/markdown/web";
import { useFileOpen } from "./use-file-open";

export function CodeEnhancer({ children }: { children: ReactNode }) {
  const onFileOpen = useFileOpen();

  const inlineCode = useCallback(
    (text: string): ReactNode | null => {
      if (!onFileOpen) return null;
      if (text.startsWith("http://") || text.startsWith("https://")) {
        return (
          <a
            className="text-caption text-primary rounded-sm bg-muted px-xs py-2xs font-mono underline hover:opacity-80"
            href={text}
            target="_blank"
            rel="noopener noreferrer"
          >
            {text}
          </a>
        );
      }
      const segments = parseFileLinks(text);
      if (segments.length === 1 && segments[0]?.type === "path") {
        const seg = segments[0]!;
        return (
          <LinkChip
            mono
            onClick={(e) => {
              e.stopPropagation();
              onFileOpen(seg.value, seg.line);
            }}
            className="text-info"
          >
            {seg.line != null ? `${seg.value}:${seg.line}` : seg.value}
          </LinkChip>
        );
      }
      return null;
    },
    [onFileOpen],
  );

  const enhancement = useMemo(
    (): MarkdownEnhancement | null => {
      if (!onFileOpen) return null;
      return { inlineCode };
    },
    [onFileOpen, inlineCode],
  );

  const value = useMarkdownEnhancement(enhancement);
  return (
    <MarkdownEnhancementContext.Provider value={value}>
      {children}
    </MarkdownEnhancementContext.Provider>
  );
}
