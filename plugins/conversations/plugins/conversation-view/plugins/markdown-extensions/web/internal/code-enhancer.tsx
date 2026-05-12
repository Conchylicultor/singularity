import { useCallback, useMemo, type ReactNode } from "react";
import { parseFileLinks } from "@plugins/primitives/plugins/file-links/web";
import {
  MarkdownEnhancementContext,
  useMarkdownEnhancement,
  type MarkdownEnhancement,
} from "@plugins/primitives/plugins/markdown/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { filePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";

export function CodeEnhancer({ children }: { children: ReactNode }) {
  const conv = conversationPane.useDataMaybe();
  const task = taskDetailPane.useDataMaybe();
  const openPane = useOpenPane();
  const worktree = conv?.conversation.attemptId ?? (task ? "main" : undefined);

  const onFileOpen = useMemo(() => {
    if (!worktree) return undefined;
    return (path: string, line?: number) =>
      openPane(filePeekPane, {
        worktree,
        filePath: line != null ? `${path}:${line}` : path,
      });
  }, [worktree, openPane]);

  const inlineCode = useCallback(
    (text: string): ReactNode | null => {
      if (!onFileOpen) return null;
      if (text.startsWith("http://") || text.startsWith("https://")) {
        return (
          <a
            className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-primary underline hover:opacity-80"
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
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFileOpen(seg.value, seg.line);
            }}
            className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-primary dark:text-blue-400 cursor-pointer hover:underline"
          >
            {seg.line != null ? `${seg.value}:${seg.line}` : seg.value}
          </button>
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
