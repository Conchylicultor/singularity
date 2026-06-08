import { useMemo, type ReactNode } from "react";
import {
  linkifyChildren,
  parseFileLinks,
} from "@plugins/primitives/plugins/file-links/web";
import {
  MarkdownEnhancementContext,
  useMarkdownEnhancement,
  type MarkdownEnhancement,
} from "@plugins/primitives/plugins/markdown/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { filePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";

export function FileLinksEnhancer({ children }: { children: ReactNode }) {
  const convId = conversationPane.useRouteEntry()?.params.convId ?? null;
  const conversation = useConversationById(convId);
  const taskEntry = taskDetailPane.useRouteEntry();
  const openPane = useOpenPane();

  const peekWorktree = filePeekPane.useRouteEntry()?.params.worktree;

  const worktree = conversation?.attemptId ?? (taskEntry ? "main" : peekWorktree);

  const onFileOpen = useMemo(() => {
    if (!worktree) return undefined;
    return (path: string, line?: number) =>
      openPane(filePeekPane, {
        worktree,
        filePath: line != null ? `${path}:${line}` : path,
      }, { mode: "push" });
  }, [worktree, openPane]);

  const enhancement = useMemo((): MarkdownEnhancement | null => {
    if (!onFileOpen) return null;
    return {
      transform: (c: ReactNode) => linkifyChildren(c, onFileOpen),
      components: {
        a: ({ href, children: kids, ...p }) => {
          if (href && !href.startsWith("http") && !href.startsWith("#")) {
            const segments = parseFileLinks(href);
            if (segments.length === 1 && segments[0]?.type === "path") {
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFileOpen(href);
                  }}
                  className="text-primary underline cursor-pointer"
                >
                  {kids}
                </button>
              );
            }
          }
          return (
            <a
              className="text-primary underline"
              href={href}
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel={
                href?.startsWith("http") ? "noopener noreferrer" : undefined
              }
              {...p}
            >
              {kids}
            </a>
          );
        },
      },
    };
  }, [onFileOpen]);

  const value = useMarkdownEnhancement(enhancement);
  return (
    <MarkdownEnhancementContext.Provider value={value}>
      {children}
    </MarkdownEnhancementContext.Provider>
  );
}
