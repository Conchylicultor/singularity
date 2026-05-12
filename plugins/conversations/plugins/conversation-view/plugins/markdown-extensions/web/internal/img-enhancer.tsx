import { useMemo, type ReactNode } from "react";
import {
  MarkdownEnhancementContext,
  useMarkdownEnhancement,
  type MarkdownEnhancement,
} from "@plugins/primitives/plugins/markdown/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { filePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";

const IMG_HREF_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)(?:[?#].*)?$/i;

function isExternalUrl(src: string): boolean {
  return (
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("data:")
  );
}

export function ImgEnhancer({ children }: { children: ReactNode }) {
  const conv = conversationPane.useDataMaybe();
  const task = taskDetailPane.useDataMaybe();
  const openPane = useOpenPane();
  const worktree = conv?.conversation.attemptId ?? (task ? "main" : undefined);

  const onFileOpen = useMemo(() => {
    if (!worktree) return undefined;
    return (path: string) =>
      openPane(filePeekPane, { worktree, filePath: path });
  }, [worktree, openPane]);

  const enhancement = useMemo((): MarkdownEnhancement | null => {
    if (!worktree) return null;
    return {
      components: {
        img: ({ src, alt }) => {
          if (typeof src !== "string" || !src) return null;
          const isImage = IMG_HREF_RE.test(src);
          if (isExternalUrl(src) && isImage) {
            return (
              <img
                src={src}
                alt={alt ?? ""}
                className="my-2 max-w-full rounded border border-border"
              />
            );
          }
          if (isImage) {
            const apiSrc = `/api/code/${encodeURIComponent(worktree)}/image?path=${encodeURIComponent(src)}`;
            return (
              <img
                src={apiSrc}
                alt={alt ?? ""}
                className="my-2 max-w-full rounded border border-border"
              />
            );
          }
          if (onFileOpen) {
            return (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFileOpen(src);
                }}
                className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-primary hover:underline"
              >
                {alt || src}
              </button>
            );
          }
          return null;
        },
      },
    };
  }, [worktree, onFileOpen]);

  const value = useMarkdownEnhancement(enhancement);
  return (
    <MarkdownEnhancementContext.Provider value={value}>
      {children}
    </MarkdownEnhancementContext.Provider>
  );
}
